import { Scene, Vector3, UniversalCamera, MeshBuilder, Mesh, Ray, Color3, StandardMaterial } from "@babylonjs/core";

export class FPSController {
    public camera!: UniversalCamera;
    public collider!: Mesh;
    public enabled: boolean = false;
    private scene: Scene;

    // Movement settings
    private baseMaxSpeed: number = 0.06;
    private mobilityMultiplier: number = 1.0;
    private maxSpeed: number = 0.06;
    private velocity: Vector3 = Vector3.Zero();
    private groundAccel: number = 0.053;
    private airAccel: number = 0.04;
    private groundFriction: number = 0.04;
    private stopFriction: number = 0.25;

    private jumpForce: number = 0.18;
    private gravity: number = -0.018;
    private velocityY: number = 0;
    private isGrounded: boolean = true;
    private keys: { [key: string]: boolean } = {};

    constructor(scene: Scene, canvas: HTMLCanvasElement) {
        this.scene = scene;
        this.setupCollider();
        this.setupCamera(canvas);
    }

    private setupCollider() {
        this.collider = MeshBuilder.CreateCapsule("playerCollider", { height: 1.8, radius: 0.4 }, this.scene);
        this.collider.visibility = 0;
        this.collider.checkCollisions = true;
        this.collider.ellipsoid = new Vector3(0.4, 0.9, 0.4);
        this.collider.position.set(0, 0.9, 0);
    }

    private setupCamera(canvas: HTMLCanvasElement) {
        this.camera = new UniversalCamera("fpsCamera", new Vector3(0, 0.9, 0), this.scene);
        this.camera.parent = this.collider;
        this.camera.attachControl(canvas, true);

        // Disable default WASD
        this.camera.keysUp = [];
        this.camera.keysDown = [];
        this.camera.keysLeft = [];
        this.camera.keysRight = [];

        this.camera.inertia = 0;
        this.camera.angularSensibility = 10000;
        this.camera.fov = 1.1;
        this.camera.minZ = 0.1;
    }

    public setupInput() {
        window.addEventListener("keydown", (e) => { this.keys[e.code] = true; });
        window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    }

    public resetInput() {
        this.keys = {};
        this.velocity.set(0, 0, 0);
        this.velocityY = 0;
    }

    public update() {
        if (!this.enabled) return;
        this.handleMovement();
        this.handleGravity();
    }

    private handleMovement() {
        const deltaTime = this.scene.getEngine().getDeltaTime() / 16.66;
        const wishDir = Vector3.Zero();
        const forward = this.camera.getForwardRay().direction;
        forward.y = 0;
        forward.normalize();

        const right = Vector3.Cross(Vector3.Up(), forward);
        right.normalize();

        if (this.keys["KeyW"]) wishDir.addInPlace(forward);
        if (this.keys["KeyS"]) wishDir.subtractInPlace(forward);
        if (this.keys["KeyA"]) wishDir.subtractInPlace(right);
        if (this.keys["KeyD"]) wishDir.addInPlace(right);

        const isMovingInput = wishDir.length() > 0;
        if (isMovingInput) wishDir.normalize();

        if (this.isGrounded) {
            if (!isMovingInput) {
                this.applyFriction(this.stopFriction, deltaTime);
            } else {
                const isCounterStrafing = Vector3.Dot(wishDir, this.velocity) < 0;
                if (isCounterStrafing) this.applyFriction(this.stopFriction, deltaTime);
                this.accelerate(wishDir, this.maxSpeed, this.groundAccel, deltaTime);
            }
        } else {
            const projectedSpeed = Vector3.Dot(this.velocity, wishDir);
            if (projectedSpeed < this.maxSpeed) {
                this.accelerate(wishDir, this.maxSpeed, this.airAccel, deltaTime);
            }
        }

        const move = this.velocity.scale(deltaTime);
        this.collider.moveWithCollisions(move);
    }

    private accelerate(wishDir: Vector3, wishSpeed: number, accel: number, deltaTime: number) {
        const currentSpeed = Vector3.Dot(this.velocity, wishDir);
        const addSpeed = wishSpeed - currentSpeed;
        if (addSpeed <= 0) return;
        const accelSpeed = accel * deltaTime * wishSpeed;
        const finalSpeed = Math.min(accelSpeed, addSpeed);
        this.velocity.addInPlace(wishDir.scale(finalSpeed));
    }

    private applyFriction(friction: number, deltaTime: number) {
        const speed = this.velocity.length();
        if (speed < 0.0001) return;
        const drop = speed * friction * deltaTime;
        const newSpeed = Math.max(speed - drop, 0);
        this.velocity.scaleInPlace(newSpeed / speed);
    }

    private handleGravity() {
        const deltaTime = this.scene.getEngine().getDeltaTime() / 16.66;

        // Raycast for ground
        const ray = new Ray(this.collider.position.add(new Vector3(0, -0.8, 0)), new Vector3(0, -1, 0), 0.2);
        const hit = this.scene.pickWithRay(ray, (m) => m.checkCollisions && m !== this.collider);

        if (hit && hit.pickedPoint) {
            if (this.velocityY <= 0) {
                this.isGrounded = true;
                this.velocityY = 0;
                // Snap to ground
                this.collider.position.y = hit.pickedPoint.y + 0.9;
            }
        } else {
            this.isGrounded = false;
        }

        if (!this.isGrounded) {
            this.velocityY += this.gravity * deltaTime;
        }

        this.collider.moveWithCollisions(new Vector3(0, this.velocityY * deltaTime, 0));

        // Death plane
        if (this.collider.position.y < -20) {
            this.collider.position.set(0, 5, 0);
            this.velocityY = 0;
        }
    }

    public jump() {
        if (this.isGrounded) {
            this.velocityY = this.jumpForce;
            this.isGrounded = false;
        }
    }

    public setMobilityMultiplier(multiplier: number) {
        this.mobilityMultiplier = multiplier || 1.0;
        this.maxSpeed = this.baseMaxSpeed * this.mobilityMultiplier;
    }

    private currentSensitivity: number = 6;
    private zoomSensitivityMultiplier: number = 1.0;

    public setSensitivity(value: number) {
        this.currentSensitivity = value;
        this.applyFinalSensitivity();
    }

    public setZoomSensitivity(multiplier: number) {
        this.zoomSensitivityMultiplier = multiplier;
        this.applyFinalSensitivity();
    }

    private applyFinalSensitivity() {
        const baseSens = 29000 - (this.currentSensitivity * 450);
        this.camera.angularSensibility = baseSens / this.zoomSensitivityMultiplier;
    }
}
