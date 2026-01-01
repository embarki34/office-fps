import { Network } from "./Network";

export class MenuSystem {
  private network: Network;
  private onJoinRoom: (roomId: string, status: string) => void;
  private playerName: string = "";
  private container: HTMLDivElement;

  constructor(network: Network, onJoinRoom: (roomId: string, status: string) => void) {
    this.network = network;
    this.onJoinRoom = onJoinRoom;
    this.playerName = localStorage.getItem("playerName") || "Agent_" + Math.floor(Math.random() * 1000);

    this.container = document.createElement("div");
    this.container.id = "menu-container";
    document.body.appendChild(this.container);

    this.setupStyles();
    this.showMainMenu();
  }

  private setupStyles() {
    const style = document.createElement("style");
    style.innerHTML = `
      #menu-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 100%);
        color: white;
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
        z-index: 10000;
      }

      .glass-panel {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
      }

      .main-content {
        flex: 1;
        display: flex;
        padding: 40px;
        gap: 20px;
      }

      .center-section {
        flex: 2;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .side-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 15px;
        max-width: 300px;
      }

      .valorant-btn {
        background: transparent;
        border: 1px solid #ff4655;
        color: white;
        padding: 15px 30px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 2px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        overflow: hidden;
      }

      .valorant-btn:hover {
        background: #ff4655;
        color: #0f0f1a;
      }

      .input-field {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        padding: 12px;
        border-radius: 4px;
        width: 100%;
        box-sizing: border-box;
      }

      .room-item {
        background: rgba(255,255,255,0.03);
        padding: 15px;
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1px solid transparent;
        transition: 0.2s;
      }

      .room-item:hover {
        border-color: #ff4655;
        background: rgba(255,255,255,0.08);
      }

      .social-player {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #444;
      }
      .status-online { background: #00ff88; }
      .status-busy { background: #ff4655; }

      h1, h2, h3 {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 4px;
      }

      #warmup-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: none;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        z-index: 5000;
        color: white;
        font-family: 'Inter', sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  public showMainMenu() {
    this.container.innerHTML = `
      <div class="main-content">
        <div class="side-panel glass-panel">
          <h3>Local Storage</h3>
          <p>Name:</p>
          <input type="text" id="player-name-input" class="input-field" value="${this.playerName}">
          <p style="font-size: 12px; color: #888;">Saved in Local Storage</p>
          <hr style="border:0; border-top: 1px solid #333; margin: 20px 0;">
          <h3>Social</h3>
          <div id="lobby-list">
             <!-- Players listed here -->
             <p>Connecting...</p>
          </div>
        </div>

        <div class="center-section">
          <div class="glass-panel">
            <h1>OFFICE FPS</h1>
            <p>Welcome back, ${this.playerName}</p>
          </div>

          <div class="glass-panel" style="flex:1; overflow-y:auto;">
            <h2>Active Matches</h2>
            <div id="room-list" style="display:flex; flex-direction:column; gap:10px; margin-top:20px;">
              <!-- Rooms listed here -->
              <p>Refreshing match list...</p>
            </div>
          </div>

          <div class="glass-panel" style="display:flex; gap:15px; align-items:flex-end;">
            <div style="flex:1">
               <label>Room Name</label>
               <input type="text" id="new-room-name" class="input-field" placeholder="My Match">
            </div>
            <div style="width:120px">
               <label>Map</label>
               <select id="new-room-map" class="input-field">
                 <option value="cyberpunk">Cyberpunk</option>
                 <option value="lowpoly">Low-Poly</option>
               </select>
            </div>
            <div style="width:100px">
               <label>Players</label>
               <input type="number" id="new-room-players" class="input-field" value="2" min="1" max="8">
            </div>
            <button id="create-room-btn" class="valorant-btn">Create Match</button>
          </div>
        </div>
      </div>
    `;

    this.setupListeners();
    this.refreshLobby();
  }

  private setupListeners() {
    const nameInput = document.getElementById("player-name-input") as HTMLInputElement;
    nameInput.onchange = () => {
      this.playerName = nameInput.value;
      localStorage.setItem("playerName", this.playerName);
      this.network.send("join-lobby", { name: this.playerName });
    };

    document.getElementById("create-room-btn")?.addEventListener("click", () => {
      const name = (document.getElementById("new-room-name") as HTMLInputElement).value || "Match";
      const max = parseInt((document.getElementById("new-room-players") as HTMLInputElement).value);
      const mapType = (document.getElementById("new-room-map") as HTMLSelectElement).value;
      this.network.send("create-room", { name, maxPlayers: max, mapType });
    });

    // Handle Network Events for Menu
    const originalCallback = (this.network as any).onMessageCallback;
    (this.network as any).onMessageCallback = (msg: any) => {
      if (msg.type === "rooms-list") {
        this.updateRoomList(msg.data);
      } else if (msg.type === "lobby-update") {
        this.updateLobbyList(msg.data);
      } else if (msg.type === "room-joined") {
        this.hide();
        localStorage.setItem("lastRoomId", msg.data.roomId);
        this.onJoinRoom(msg.data.roomId, msg.data.status);
      } else if (msg.type === "error" && msg.data.code === "ROOM_NOT_FOUND") {
        console.warn("Reconnection failed: Room not found.");
        localStorage.removeItem("lastRoomId");
        this.show();
      }
      originalCallback(msg);
    };
  }

  private updateRoomList(rooms: any[]) {
    const list = document.getElementById("room-list");
    if (!list) return;
    if (rooms.length === 0) {
      list.innerHTML = "<p>No matches found. Create one!</p>";
      return;
    }

    list.innerHTML = rooms.map(r => `
      <div class="room-item">
        <div>
          <strong style="color:#ff4655">${r.name}</strong><br>
          <span style="font-size:12px; color:#aaa;">Map: ${r.mapType.toUpperCase()} | Status: ${r.status}</span>
        </div>
        <div style="display:flex; align-items:center; gap:20px;">
          <span>${r.current} / ${r.max}</span>
          <button class="valorant-btn" style="padding: 8px 15px;" onclick="window.joinRoom('${r.id}')">Join</button>
        </div>
      </div>
    `).join("");

    // Hook up join buttons
    (window as any).joinRoom = (id: string) => {
      this.network.send("join-room", { roomId: id });
    };
  }

  private updateLobbyList(players: any[]) {
    const list = document.getElementById("lobby-list");
    if (!list) return;
    list.innerHTML = players.map(p => `
      <div class="social-player">
        <div class="status-dot ${p.inRoom ? 'status-busy' : 'status-online'}"></div>
        <span>${p.name}</span>
        <span style="font-size:10px; color:#666; margin-left:auto">${p.inRoom ? 'IN MATCH' : 'LOBBY'}</span>
      </div>
    `).join("");
  }

  private refreshLobby() {
    this.network.send("join-lobby", { name: this.playerName });

    // Check for reconnection
    const lastRoomId = localStorage.getItem("lastRoomId");
    if (lastRoomId) {
      console.log("Attempting reconnection to room:", lastRoomId);
      this.network.send("join-room", { roomId: lastRoomId });
    }

    this.network.send("list-rooms", {});
    // Regular refresh?
    setInterval(() => {
      if (this.container.style.display !== "none") {
        this.network.send("list-rooms", {});
      }
    }, 5000);
  }

  public hide() {
    this.container.style.display = "none";
  }

  public show() {
    this.container.style.display = "flex";
  }
}
