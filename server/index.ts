import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

interface Player {
    id: string;
    ws: WebSocket;
    name: string;
    roomId: string | null;
}

interface Room {
    id: string;
    name: string;
    maxPlayers: number;
    players: Set<string>; // Set of player IDs
    status: 'WARMUP' | 'ACTIVE';
    mapType: string;
}

const players: Map<string, Player> = new Map();
const rooms: Map<string, Room> = new Map();

wss.on('connection', (ws: WebSocket) => {
    const clientId = Math.random().toString(36).substring(7);
    const player: Player = { ws, id: clientId, name: 'Guest', roomId: null };
    players.set(clientId, player);

    console.log(`Player connected: ${clientId}`);

    ws.on('message', (message: any) => {
        try {
            const data = JSON.parse(message.toString());
            const type = data.type;
            const payload = data.data;

            switch (type) {
                case 'join-lobby':
                    player.name = payload.name;
                    broadcastLobbyUpdate();
                    break;

                case 'list-rooms':
                    const roomList = Array.from(rooms.values()).map(r => ({
                        id: r.id,
                        name: r.name,
                        current: r.players.size,
                        max: r.maxPlayers,
                        status: r.status,
                        mapType: r.mapType
                    }));
                    ws.send(JSON.stringify({ type: 'rooms-list', data: roomList }));
                    break;

                case 'create-room':
                    const roomId = Math.random().toString(36).substring(7);
                    const newRoom: Room = {
                        id: roomId,
                        name: payload.name,
                        maxPlayers: payload.maxPlayers || 4,
                        players: new Set(),
                        status: 'WARMUP',
                        mapType: payload.mapType || 'cyberpunk'
                    };
                    rooms.set(roomId, newRoom);
                    // Automatically join
                    joinRoom(player, roomId);
                    break;

                case 'join-room':
                    joinRoom(player, payload.roomId);
                    break;

                default:
                    // Room-based relay
                    if (player.roomId) {
                        relayToRoom(player, data);
                    }
                    break;
            }
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    });

    ws.on('close', () => {
        console.log(`Player disconnected: ${clientId}`);
        if (player.roomId) {
            leaveRoom(player);
        }
        players.delete(clientId);
        broadcastLobbyUpdate();
    });

    // Initial handshake
    ws.send(JSON.stringify({ type: 'init', data: { id: clientId } }));
});

function joinRoom(player: Player, roomId: string) {
    const room = rooms.get(roomId);
    if (!room) {
        player.ws.send(JSON.stringify({ type: 'error', data: { message: 'Room not found', code: 'ROOM_NOT_FOUND' } }));
        return;
    }

    if (player.roomId) leaveRoom(player);

    player.roomId = roomId;
    room.players.add(player.id);

    // Update room status
    if (room.players.size >= room.maxPlayers && room.status === 'WARMUP') {
        room.status = 'ACTIVE';
        // Notify everyone in the room that match started
        const startMsg = JSON.stringify({ type: 'room-status', data: { status: 'ACTIVE' } });
        room.players.forEach(pid => {
            const p = players.get(pid);
            if (p && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(startMsg);
            }
        });
    }

    // Notify player about the room and current players
    const existingPlayers = Array.from(room.players).map(pid => {
        const p = players.get(pid);
        return { id: p?.id, name: p?.name };
    });

    player.ws.send(JSON.stringify({
        type: 'room-joined',
        data: {
            roomId,
            status: room.status,
            players: existingPlayers,
            mapType: room.mapType
        }
    }));

    // Notify others in the room about the new player
    relayToRoom(player, { type: 'join', data: { name: player.name, id: player.id } });

    broadcastLobbyUpdate();
}

function leaveRoom(player: Player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (room) {
        room.players.delete(player.id);
        if (room.players.size === 0) {
            rooms.delete(room.id);
        } else {
            relayToRoom(player, { type: 'disconnect', data: { id: player.id } });
        }
    }
    player.roomId = null;
    broadcastLobbyUpdate();
}

function relayToRoom(sender: Player, data: any) {
    if (!sender.roomId) return;
    const room = rooms.get(sender.roomId);
    if (!room) return;

    data.senderId = sender.id;
    const msg = JSON.stringify(data);

    room.players.forEach(pid => {
        if (pid !== sender.id) {
            const p = players.get(pid);
            if (p && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(msg);
            }
        }
    });
}

function broadcastLobbyUpdate() {
    const lobbyPlayers = Array.from(players.values()).map(p => ({
        id: p.id,
        name: p.name,
        inRoom: !!p.roomId
    }));
    const msg = JSON.stringify({ type: 'lobby-update', data: lobbyPlayers });
    players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(msg);
        }
    });
}

console.log('WebSocket server running on ws://localhost:3000');
