import { Mesh, Vector3, AnimationGroup, AbstractMesh } from "@babylonjs/core";

export interface IPlayer {
    id: string;
    name: string;
    health: number;
    position: Vector3;
    rotation: Vector3;
    isDead: boolean;
    kills: number;
}

export class Player implements IPlayer {
    public id: string;
    public name: string;
    public health: number = 100;
    public position: Vector3 = Vector3.Zero();
    public rotation: Vector3 = Vector3.Zero();
    public targetPosition: Vector3 = Vector3.Zero();
    public targetRotation: Vector3 = Vector3.Zero();
    public isDead: boolean = false;
    public kills: number = 0;
    public mesh?: Mesh;
    public weaponMesh?: AbstractMesh;
    public currentWeaponType: string = "pistol";
    public animationGroups: AnimationGroup[] = [];
    public currentAnimation: string = "Idle";

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
    }

    public takeDamage(amount: number) {
        if (this.isDead) return;
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
        }
    }

    protected die() {
        this.isDead = true;
        this.health = 0;
        if (this.mesh) {
            this.mesh.setEnabled(false);
        }
        console.log(`${this.name} died`);
    }

    public respawn(position: Vector3) {
        this.health = 100;
        this.isDead = false;
        this.position.copyFrom(position);
        if (this.mesh) {
            this.mesh.position.copyFrom(position);
            this.mesh.setEnabled(true);
        }
    }
}
