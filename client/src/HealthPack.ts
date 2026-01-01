import { Scene, Vector3, MeshBuilder, StandardMaterial, Color3, Mesh } from "@babylonjs/core";

export class HealthPack {
    public mesh: Mesh;
    private scene: Scene;
    private rotationSpeed: number = 0.02;

    constructor(scene: Scene, position: Vector3) {
        this.scene = scene;
        this.mesh = MeshBuilder.CreateBox("healthPack", { size: 0.5 }, this.scene);
        this.mesh.position.copyFrom(position);

        const mat = new StandardMaterial("hpMat", this.scene);
        mat.diffuseColor = Color3.Green();
        mat.emissiveColor = new Color3(0, 0.5, 0);
        this.mesh.material = mat;

        // Add a "plus" sign or similar visual
        const v = MeshBuilder.CreateBox("plus_v", { width: 0.1, height: 0.4, depth: 0.51 }, this.scene);
        v.parent = this.mesh;
        const h = MeshBuilder.CreateBox("plus_h", { width: 0.4, height: 0.1, depth: 0.51 }, this.scene);
        h.parent = this.mesh;

        const plusMat = new StandardMaterial("plusMat", this.scene);
        plusMat.diffuseColor = Color3.White();
        v.material = h.material = plusMat;
    }

    public update() {
        this.mesh.rotation.y += this.rotationSpeed;
        this.mesh.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.2;
    }

    public dispose() {
        this.mesh.dispose();
    }
}
