export class Network {
    private socket: WebSocket | null = null;
    private onMessageCallback: (msg: any) => void;
    private localId: string = "";

    constructor(onMessage: (msg: any) => void) {
        this.onMessageCallback = onMessage;
    }

    public getLocalId() {
        return this.localId;
    }

    public connect(url: string = `ws://${window.location.hostname}:3000`) {
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
            console.log("Connected to server");
        };

        this.socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "init") {
                this.localId = msg.data.id;
            }
            this.onMessageCallback(msg);
        };

        this.socket.onclose = () => {
            console.log("Disconnected from server");
        };
    }

    public send(type: string, data: any) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, data }));
        }
    }
}
