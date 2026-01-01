import { Scene, Ray, Vector3, MeshBuilder, StandardMaterial, Color3, SceneLoader, AbstractMesh, Camera, UniversalCamera } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { FPSController } from "./FPSController";

export interface WeaponConfig {
    name: string;
    damage: number;
    fireRate: number; // ms between shots
    maxAmmo: number;
    mobility: number; // 0.5 to 1.1 multiplier for move speed
    headshotMultiplier: number;
    rangeFalloff: number; // percentage damage retained at 50m
    isAutomatic: boolean;
    reloadTime: number; // in ms
    modelPath: string;
    scale: Vector3;
    position: Vector3;
    rotation: Vector3;
    recoilKick: number;
    recoilRotation: number;
    zoomFOV?: number;
    cameraShakeIntensity: number;
}

export const WEAPON_CONFIGS: { [key: string]: WeaponConfig } = {
    pistol: {
        name: "Pistol",
        damage: 25,
        fireRate: 200,
        maxAmmo: 12,
        mobility: 1.0,
        headshotMultiplier: 2.5,
        rangeFalloff: 0.6,
        isAutomatic: false,
        reloadTime: 1500,
        modelPath: "models/pistol.glb",
        scale: new Vector3(0.0476, 0.0476, 0.0476),
        position: new Vector3(0.27, -0.29, 0.88),
        rotation: new Vector3(-1.75, 1.4, -3),
        recoilKick: 0.1,
        recoilRotation: 0.1,
        cameraShakeIntensity: 0.015
    },
    smg: {
        name: "SMG",
        damage: 15,
        fireRate: 80,
        maxAmmo: 30,
        mobility: 1.05,
        headshotMultiplier: 1.8,
        rangeFalloff: 0.4,
        isAutomatic: true,
        reloadTime: 2000,
        modelPath: "models/smg.glb",
        scale: new Vector3(0.04, 0.04, 0.04),
        position: new Vector3(0.17, -0.1, 0.48),
        rotation: new Vector3(0.01, 0.1, -1.45),
        recoilKick: 0.05,
        recoilRotation: 0.05,
        cameraShakeIntensity: 0.01
    },
    ar: {
        name: "Assault Rifle",
        damage: 32,
        fireRate: 120,
        maxAmmo: 25,
        mobility: 0.88,
        headshotMultiplier: 2.2,
        rangeFalloff: 0.85,
        isAutomatic: true,
        reloadTime: 2200,
        modelPath: "models/ar.glb",
        scale: new Vector3(0.0697, 0.0697, 0.0697),
        position: new Vector3(0.24, -0.18, 0.72),
        rotation: new Vector3(-0.03, -0.05, -1.61),
        recoilKick: 0.15,
        recoilRotation: 0.12,
        cameraShakeIntensity: 0.02
    },
    sniper: {
        name: "Sniper",
        damage: 85,
        fireRate: 1000,
        maxAmmo: 5,
        mobility: 0.75,
        headshotMultiplier: 4.0,
        rangeFalloff: 1.0,
        isAutomatic: false,
        reloadTime: 3000,
        modelPath: "models/sniper.glb",
        scale: new Vector3(0.0827, 0.0827, 0.0827),
        position: new Vector3(0.17, -0.17, 0.55),
        rotation: new Vector3(0.02, -0.01, -1.49),
        recoilKick: 0.4,
        recoilRotation: 0.3,
        zoomFOV: 0.3, // Deep zoom for sniper
        cameraShakeIntensity: 0.05
    }
};

export class WeaponSystem {
    private scene: Scene;
    private camera: UniversalCamera;
    private controller: FPSController;

    public currentType: string = "pistol";
    private lastFireTime: number = 0;
    private ammoStorage: Map<string, number> = new Map();
    public isZoomed: boolean = false;
    public isReloading: boolean = false;
    public reloadProgress: number = 0;
    private reloadStartTime: number = 0;

    private recoilPositionOffset: Vector3 = Vector3.Zero();
    private recoilRotationOffset: Vector3 = Vector3.Zero();
    private cameraShakeOffset: Vector3 = Vector3.Zero();
    private lastAppliedShake: Vector3 = Vector3.Zero();

    private gunMesh?: AbstractMesh;
    private gunshotSound: HTMLAudioElement;

    constructor(scene: Scene, camera: UniversalCamera, controller: FPSController) {
        this.scene = scene;
        this.camera = camera;
        this.controller = controller;
        this.gunshotSound = new Audio("/sounds/gunshot.wav");

        // Initialize ammo for all weapons
        Object.keys(WEAPON_CONFIGS).forEach(type => {
            this.ammoStorage.set(type, WEAPON_CONFIGS[type].maxAmmo);
        });

        this.switchWeapon("pistol");
    }

    private loadModel(config: WeaponConfig) {
        if (!config.modelPath) return;

        console.log(`Loading Weapon Model: ${config.modelPath}`);
        // Use absolute-looking path to ensure it works from any subdirectory if needed
        const path = config.modelPath.startsWith("/") ? config.modelPath : "/" + config.modelPath;

        SceneLoader.ImportMesh("", "", path, this.scene, (meshes) => {
            // Dispose old mesh if it exists
            if (this.gunMesh) {
                this.gunMesh.dispose(false, true);
            }

            const gunParent = MeshBuilder.CreateBox("weaponParent", { size: 0.1 }, this.scene);
            gunParent.isVisible = false;
            gunParent.parent = this.camera;

            gunParent.position.copyFrom(config.position);
            gunParent.rotation.copyFrom(config.rotation);
            gunParent.scaling.copyFrom(config.scale);

            meshes.forEach(m => {
                m.parent = gunParent;
                m.isPickable = false;
                m.renderingGroupId = 2; // Always on top

                // Some GLB models need this to render correctly in first person
                if (m.material) {
                    m.material.backFaceCulling = false;
                }
            });

            this.gunMesh = gunParent;
            console.log(`Weapon ${config.name} loaded successfully.`);
        }, null, (scene, message, exception) => {
            console.error(`Failed to load weapon model: ${config.modelPath}`, message, exception);
        });
    }

    public switchWeapon(type: string) {
        if (!WEAPON_CONFIGS[type]) return;

        // Only skip if already current AND we have the mesh
        if (type === this.currentType && this.gunMesh) return;

        console.log(`Switching weapon to: ${type}`);
        this.currentType = type;
        const config = WEAPON_CONFIGS[type];
        this.isZoomed = false; // Reset zoom on switch
        this.isReloading = false; // Reset reload on switch
        this.reloadProgress = 0;

        // Apply mobility to player
        this.controller.setMobilityMultiplier(config.mobility);

        // Load specific model
        this.loadModel(config);

        console.log(`Switched to ${config.name}`);
    }

    public toggleZoom(state?: boolean) {
        const config = this.config;
        if (!config.zoomFOV) return; // Only weapons with zoom config can zoom

        this.isZoomed = state !== undefined ? state : !this.isZoomed;

        if (this.gunMesh) {
            // Hide gun model when zoomed as requested
            this.gunMesh.setEnabled(!this.isZoomed);
        }
    }

    public reload(): boolean {
        if (this.isReloading || this.ammo === this.config.maxAmmo) return false;

        this.isReloading = true;
        this.reloadStartTime = Date.now();
        this.reloadProgress = 0;
        console.log(`Reloading ${this.config.name}...`);
        return true;
    }

    public get config(): WeaponConfig {
        return WEAPON_CONFIGS[this.currentType];
    }

    public get ammo(): number {
        return this.ammoStorage.get(this.currentType) || 0;
    }

    public set ammo(value: number) {
        this.ammoStorage.set(this.currentType, value);
    }

    public shoot(onHit: (targetId: string, damage: number, isHeadshot: boolean) => void): boolean {
        const now = Date.now();
        const config = this.config;

        if (this.isReloading) return false;
        if (now - this.lastFireTime < config.fireRate) return false;
        if (this.ammo <= 0) {
            // Click sound for empty?
            return false;
        }

        this.lastFireTime = now;
        this.ammo--;

        // Visuals and Sound
        this.gunshotSound.currentTime = 0;
        this.gunshotSound.play().catch(() => { });
        this.showMuzzleFlash();

        // Raycast
        const ray = this.camera.getForwardRay(100);
        const hit = this.scene.pickWithRay(ray);

        if (hit && hit.hit) {
            const meshName = hit.pickedMesh?.name || "";
            if (meshName.startsWith("player_") || meshName.startsWith("visor_")) {
                const isHeadshot = meshName.startsWith("visor_");
                const targetId = meshName.split("_")[1];

                // Calculate Damage with Falloff
                const distance = Vector3.Distance(this.camera.position, hit.pickedPoint!);
                let finalDamage = config.damage;

                // Simple falloff: linear towards rangeFalloff at 50 units
                const falloffFactor = Math.max(config.rangeFalloff, 1 - (distance / 50) * (1 - config.rangeFalloff));
                finalDamage *= falloffFactor;

                if (isHeadshot) finalDamage *= config.headshotMultiplier;

                onHit(targetId, Math.ceil(finalDamage), isHeadshot);
            }
            this.showImpact(hit.pickedPoint!);
        }

        // Apply recoil
        this.recoilPositionOffset.z = -config.recoilKick;
        this.recoilRotationOffset.z = config.recoilRotation; // Actually pitch for these models usually

        // Apply camera shake
        this.cameraShakeOffset.x = (Math.random() - 0.5) * config.cameraShakeIntensity;
        this.cameraShakeOffset.y = (Math.random() - 0.5) * config.cameraShakeIntensity;

        return true;
    }

    public update(deltaTime: number) {
        if (!this.gunMesh) return;

        const config = this.config;

        // FOV Zoom Interpolation
        const targetFOV = this.isZoomed ? (config.zoomFOV || 1.1) : 1.1;
        this.camera.fov = (this.camera.fov * 0.8) + (targetFOV * 0.2);

        // Handle Reload
        if (this.isReloading) {
            const now = Date.now();
            const elapsed = now - this.reloadStartTime;
            this.reloadProgress = Math.min(elapsed / config.reloadTime, 1);

            if (this.reloadProgress >= 1) {
                this.isReloading = false;
                this.ammo = config.maxAmmo;
                console.log(`${config.name} Reloaded!`);
            }
        }

        // Recover recoil
        const recoverSpeed = 0.1;
        this.recoilPositionOffset = Vector3.Lerp(this.recoilPositionOffset, Vector3.Zero(), recoverSpeed);
        this.recoilRotationOffset = Vector3.Lerp(this.recoilRotationOffset, Vector3.Zero(), recoverSpeed);

        // Remove last frame's shake so it doesn't drift permanent aim
        this.camera.rotation.x -= this.lastAppliedShake.x;
        this.camera.rotation.y -= this.lastAppliedShake.y;

        // Calculate and apply new shake frame
        this.cameraShakeOffset = Vector3.Lerp(this.cameraShakeOffset, Vector3.Zero(), 0.3); // Faster recovery
        this.camera.rotation.x += this.cameraShakeOffset.x;
        this.camera.rotation.y += this.cameraShakeOffset.y;

        // Save current shake to remove it next frame
        this.lastAppliedShake.copyFrom(this.cameraShakeOffset);

        // Apply transforms
        // Base + Recoil
        this.gunMesh.position.copyFrom(config.position).addInPlace(this.recoilPositionOffset);

        // Babylon uses Euler for rotation usually on AbstractMesh. 
        // We additive apply the recoil rotation offset.
        this.gunMesh.rotation.copyFrom(config.rotation).addInPlace(this.recoilRotationOffset);
    }

    public triggerHitShake(intensity: number = 0.1) {
        this.cameraShakeOffset.x = (Math.random() - 0.5) * intensity;
        this.cameraShakeOffset.y = (Math.random() - 0.5) * intensity;
    }

    private showMuzzleFlash() {
        if (!this.gunMesh) return;
        const flash = MeshBuilder.CreateSphere("muzzleFlash", { diameter: 0.1 }, this.scene);
        flash.parent = this.gunMesh;
        flash.position.set(0, 0, 0.5);

        const mat = new StandardMaterial("flashMat", this.scene);
        mat.emissiveColor = Color3.FromHexString("#ffaa00");
        flash.material = mat;
        flash.renderingGroupId = 2;

        setTimeout(() => flash.dispose(), 30);
    }

    private showImpact(point: Vector3) {
        const sphere = MeshBuilder.CreateSphere("impact", { diameter: 0.15 }, this.scene);
        sphere.position.copyFrom(point);
        sphere.renderingGroupId = 1;

        const mat = new StandardMaterial("impactMat", this.scene);
        mat.emissiveColor = Color3.Yellow();
        sphere.material = mat;

        setTimeout(() => sphere.dispose(), 100);
    }

}

