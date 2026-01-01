import { Scene, Ray, Vector3, MeshBuilder, StandardMaterial, Color3, SceneLoader, AbstractMesh, Camera } from "@babylonjs/core";
import "@babylonjs/loaders/OBJ";

export class Weapon {
    private scene: Scene;
    private lastFireTime: number = 0;
    private fireRate: number = 200; // ms
    public damage: number = 20;
    private gunMesh?: AbstractMesh;
    private gunshotSound: HTMLAudioElement;
    public currentWeapon: "pistol" | "smg" | "sniper" = "pistol";

    constructor(scene: Scene, camera: Camera) {
        this.scene = scene;
        this.gunshotSound = new Audio("/sounds/gunshot.wav");
        this.loadModel(camera);
    }

    private loadModel(camera: Camera) {
        console.log("Attempting to load M9 model from /models/M9.obj");
        SceneLoader.ImportMesh("", "/models/", "M9.obj", this.scene, (meshes) => {
            console.log(`M9 model found: ${meshes.length} meshes.`);

            // Create a parent container for the gun
            const gunParent = MeshBuilder.CreateBox("gunParent", { size: 0.1 }, this.scene);
            gunParent.isVisible = false;
            gunParent.parent = camera;

            // Positioning the view model
            gunParent.position.set(0.3, -0.4, 0.7);
            gunParent.rotation.set(0, Math.PI, 0);
            gunParent.scaling.set(0.01, 0.01, 0.01); // Smaller scale for M9 if it's huge

            meshes.forEach(m => {
                m.parent = gunParent;
                m.isPickable = false;
                m.renderingGroupId = 2; // Renders on top of everything else (prevents wall clipping)

                // Ensure material is double-sided or at least visible
                if (m.material) {
                    m.material.backFaceCulling = false;
                }

                console.log(`Mesh: ${m.name}, Visible: ${m.isVisible}`);
            });

            this.gunMesh = gunParent;
            console.log("M9 View Model initialized on rendering group 2");
        }, (evt) => {
            // Progress callback
        }, (scene, message, exception) => {
            console.error("Error loading M9 model:", message, exception);
        });
    }

    public switchWeapon(type: "pistol" | "smg" | "sniper") {
        this.currentWeapon = type;
        if (type === "pistol") {
            this.fireRate = 200;
            this.damage = 20;
        } else if (type === "smg") {
            this.fireRate = 80;
            this.damage = 10;
        } else if (type === "sniper") {
            this.fireRate = 800;
            this.damage = 100;
        }
    }

    public shoot(origin: Vector3, direction: Vector3, onHit: (hitPoint: Vector3, targetId: string | null) => void) {
        const now = Date.now();
        if (now - this.lastFireTime < this.fireRate) return;
        this.lastFireTime = now;

        // Play Sound
        this.gunshotSound.currentTime = 0;
        this.gunshotSound.play().catch(e => console.error("Sound error:", e));

        // Muzzle Flash effect
        if (this.gunMesh) {
            this.showMuzzleFlash();
        }

        const ray = new Ray(origin, direction, 100);
        const hit = this.scene.pickWithRay(ray);

        const endPoint = hit && hit.hit ? hit.pickedPoint! : origin.add(direction.scale(100));

        this.showTracer(origin, endPoint);

        if (hit && hit.hit) {
            const targetId = hit.pickedMesh?.name.startsWith("player_") ? hit.pickedMesh.name.replace("player_", "") : null;
            this.showImpact(endPoint);
            onHit(endPoint, targetId);
        }
    }

    private showMuzzleFlash() {
        const flash = MeshBuilder.CreateSphere("muzzleFlash", { diameter: 0.1 }, this.scene);
        flash.parent = this.gunMesh!;
        flash.position.set(0, 0, 0.5); // Near the barrel

        const mat = new StandardMaterial("flashMat", this.scene);
        mat.emissiveColor = Color3.FromHexString("#ffaa00");
        flash.material = mat;
        flash.renderingGroupId = 2;

        setTimeout(() => flash.dispose(), 30);
    }

    private showTracer(start: Vector3, end: Vector3) {
        const lines = MeshBuilder.CreateLines("tracer", { points: [start, end] }, this.scene);
        lines.color = Color3.White();
        lines.isPickable = false;

        setTimeout(() => {
            lines.dispose();
        }, 50);
    }

    private showImpact(point: Vector3) {
        const sphere = MeshBuilder.CreateSphere("impact", { diameter: 0.15 }, this.scene);
        sphere.position.copyFrom(point);
        const mat = new StandardMaterial("impactMat", this.scene);
        mat.emissiveColor = Color3.Yellow();
        sphere.material = mat;

        setTimeout(() => {
            sphere.dispose();
        }, 100);
    }
}
