import {
  Scene,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  Engine,
  StandardMaterial,
  Color3,
  Mesh,
  DynamicTexture,
  PointLight,
  SpotLight,
  SceneLoader,
  AbstractMesh,
  GlowLayer
} from "@babylonjs/core";
import { FPSController } from "./FPSController";
import { Network } from "./Network";
import { Player } from "./Player";
import { WeaponSystem, WEAPON_CONFIGS } from "./WeaponSystem";
import { HealthPack } from "./HealthPack";

export class Game {
  public scene: Scene;
  private controller!: FPSController;
  private network!: Network;
  private weapon!: WeaponSystem;
  private localPlayerId: string = "";
  private playerName: string = "";
  private kills: number = 0;
  private isDead: boolean = false;
  private health: number = 100;
  private healthPacks: HealthPack[] = [];
  private minimapCanvas?: HTMLCanvasElement;
  private minimapCtx?: CanvasRenderingContext2D;
  private gameOver: boolean = false;
  private hitSound!: HTMLAudioElement;
  private headshotSound!: HTMLAudioElement;
  private readonly WIN_SCORE = 10;
  private lastMoveTime: number = 0;
  private remotePlayers: Map<string, Player> = new Map();
  private isShooting: boolean = false;
  private isHealing: boolean = false;
  private healingProgress: number = 0;
  private healingStartTime: number = 0;
  private readonly HEAL_TIME = 5000; // 5 seconds to heal
  private isMatchActive: boolean = false;
  private currentMapType: string = "cyberpunk";

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.scene = new Scene(engine);
    this.scene.collisionsEnabled = true;

    this.controller = new FPSController(this.scene, canvas);
    this.controller.setupInput();
    this.weapon = new WeaponSystem(this.scene, this.controller.camera, this.controller);
    this.localPlayerId = "";

    this.setupScene();
    this.createUI();
    this.spawnHealthPacks();
    this.setupMinimap();

    this.setupKeyboardListeners();

    // Game loop
    engine.runRenderLoop(() => {
      if (this.isMatchActive && this.network) {
        this.update();
      }
      this.scene.render();
    });
  }

  public startMatch(network: Network, name: string, status: string) {
    this.network = network;
    this.playerName = name;
    this.localPlayerId = this.network.getLocalId();
    this.isMatchActive = true;
    console.log("Match started. Local ID:", this.localPlayerId);

    // Focus game canvas and setup click-to-lock
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.focus();

      // Ensure clicking anywhere locks the mouse
      const lockHandler = () => {
        if (this.isMatchActive) {
          canvas.requestPointerLock?.();
        }
      };
      window.addEventListener("click", lockHandler);
    }

    // Add custom message handling for room logic
    const originalCallback = (this.network as any).onMessageCallback;
    (this.network as any).onMessageCallback = (msg: any) => {
      originalCallback(msg); // Let MenuSystem handle its lobby updates
      this.handleNetworkMessage(msg);
    };

    if (status === "WARMUP") {
      this.showWarmupOverlay(true);
    }

    // Force weapon reload to ensure it appears in first-person
    this.weapon.switchWeapon(this.weapon.currentType);

    // Reset local state for the match
    this.health = 100;
    this.isDead = false;
    this.kills = 0;
    this.controller.enabled = true;
    this.controller.resetInput();
    this.controller.collider.position.set(0, 0.9, 0);

    // Join the game world
    this.network.send("join", { name: this.playerName, kills: this.kills });
  }

  private showWarmupOverlay(show: boolean) {
    let overlay = document.getElementById("warmup-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "warmup-overlay";
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.background = "rgba(0,0,0,0.7)";
      overlay.style.display = "flex";
      overlay.style.justifyContent = "center";
      overlay.style.alignItems = "center";
      overlay.style.flexDirection = "column";
      overlay.style.zIndex = "5000";
      overlay.style.color = "white";
      overlay.style.fontFamily = "Inter, sans-serif";
      overlay.innerHTML = `
        <h1 style="font-size: 48px; letter-spacing: 10px; margin-bottom: 20px;">WARMUP</h1>
        <p style="font-size: 20px; color: #ff4655;">WAITING FOR MORE AGENTS...</p>
        <p style="font-size: 14px; margin-top: 40px; color: #888;">Practice movement while you wait.</p>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = show ? "flex" : "none";
  }

  private setupScene() {
    // Clear existing meshes if any (except fundamental ones)
    this.scene.meshes.forEach(m => {
      if (m.name !== "skyBox" && m.name !== "playerCollider") m.dispose();
    });

    // Add Glow Layer for neon pop
    const glow = new GlowLayer("glow", this.scene);
    glow.intensity = 0.6;

    if (this.currentMapType === "lowpoly") {
      this.setupLowPolyMap();
    } else {
      this.setupCyberpunkMap();
    }
  }

  private setupLowPolyMap() {
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.8;
    this.scene.clearColor = new Color3(0.5, 0.7, 1.0).toColor4(); // Light blue sky

    const mapPath = "/models/maps/low_poly_map.glb";
    const mapRoot = new Mesh("mapRoot", this.scene);
    mapRoot.scaling.setAll(0.3);

    SceneLoader.ImportMesh("", "", mapPath, this.scene, (meshes) => {
      meshes.forEach(m => {
        if (!m.parent) m.parent = mapRoot;
        m.checkCollisions = true;
        m.isPickable = true;
        m.freezeWorldMatrix();
      });
    }, null, (s, msg) => {
      console.error("Map Load Failed:", msg);
    });
  }

  private setupCyberpunkMap() {
    this.scene.clearColor = new Color3(0.01, 0.01, 0.05).toColor4();

    // Lighting
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.4;

    // Arena
    const ground = MeshBuilder.CreateGround("ground", { width: 60, height: 60 }, this.scene);
    const groundMat = new StandardMaterial("groundMat", this.scene);
    groundMat.diffuseColor = new Color3(0.1, 0.1, 0.15);
    ground.material = groundMat;
    ground.checkCollisions = true;

    // Walls
    this.createWall("wall_n", new Vector3(0, 3, 30), new Vector3(60, 6, 1), new Color3(0.2, 0.2, 0.3), new Color3(0, 1, 1));
    this.createWall("wall_s", new Vector3(0, 3, -30), new Vector3(60, 6, 1), new Color3(0.2, 0.2, 0.3), new Color3(0, 1, 1));
    this.createWall("wall_e", new Vector3(30, 3, 0), new Vector3(1, 6, 60), new Color3(0.2, 0.2, 0.3), new Color3(0, 1, 1));
    this.createWall("wall_w", new Vector3(-30, 3, 0), new Vector3(1, 6, 60), new Color3(0.2, 0.2, 0.3), new Color3(0, 1, 1));

    // Mid pillars
    this.createBox("pillar_1", new Vector3(10, 3, 10), new Vector3(4, 6, 4), new Color3(0.3, 0.1, 0.3), new Color3(1, 0, 1));
    this.createBox("pillar_2", new Vector3(-10, 3, 10), new Vector3(4, 6, 4), new Color3(0.3, 0.1, 0.3), new Color3(1, 0, 1));
    this.createBox("pillar_3", new Vector3(10, 3, -10), new Vector3(4, 6, 4), new Color3(0.3, 0.1, 0.3), new Color3(1, 0, 1));
    this.createBox("pillar_4", new Vector3(-10, 3, -10), new Vector3(4, 6, 4), new Color3(0.3, 0.1, 0.3), new Color3(1, 0, 1));
  }

  private createWall(name: string, pos: Vector3, size: Vector3, color: Color3, neonColor?: Color3) {
    const wall = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    wall.position.copyFrom(pos);
    wall.checkCollisions = true;
    const wallMat = new StandardMaterial(name + "Mat", this.scene);
    wallMat.diffuseColor = color;
    if (neonColor) {
      wallMat.emissiveColor = neonColor.scale(0.2);
    }
    wall.material = wallMat;
  }

  private createBox(name: string, pos: Vector3, size: Vector3, color: Color3, glowColor?: Color3) {
    const box = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    box.position.copyFrom(pos);
    box.checkCollisions = true;
    const boxMat = new StandardMaterial(name + "Mat", this.scene);
    boxMat.diffuseColor = color;
    if (glowColor) {
      boxMat.emissiveColor = glowColor.scale(0.3);
    }
    box.material = boxMat;
  }

  private setupKeyboardListeners() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "1") {
        this.weapon.switchWeapon("pistol");
        this.showKillFeed("EQUIPPED PISTOL");
      } else if (e.key === "2") {
        this.weapon.switchWeapon("smg");
        this.showKillFeed("EQUIPPED SMG");
      } else if (e.key === "3") {
        this.weapon.switchWeapon("ar");
        this.showKillFeed("EQUIPPED ASSAULT RIFLE");
      } else if (e.key === "4") {
        this.weapon.switchWeapon("sniper");
        this.showKillFeed("EQUIPPED SNIPER");
        this.updateZoomSensitivity(); // Reset sensitivity on switch
      } else if (e.key === "r" || e.key === "R") {
        this.weapon.reload();
      } else if (e.key === "h" || e.key === "H") {
        this.startHealing();
      } else if (e.key === "p" || e.key === "P") {
        this.togglePlayerDebug();
      } else if (e.code === "Space") {
        this.controller.jump();
      }
    });

    // Prevent right-click menu
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button === 0) {
        this.isShooting = true;
      } else if (e.button === 2) {
        // Right click: Toggle Zoom
        this.weapon.toggleZoom(true);
        this.updateZoomSensitivity();
      }
    });

    window.addEventListener("mouseup", (e: MouseEvent) => {
      if (e.button === 0) {
        this.isShooting = false;
      } else if (e.button === 2) {
        // Toggle zoom off on release
        this.weapon.toggleZoom(false);
        this.updateZoomSensitivity();
      }
    });
  }

  private updateZoomSensitivity() {
    const scope = document.getElementById("scope-overlay");
    if (this.weapon.isZoomed) {
      if (scope) scope.style.display = "flex";
    } else {
      if (scope) scope.style.display = "none";
    }
  }
  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case "init":
        this.localPlayerId = msg.data.id;
        break;

      case "room-joined":
      case "room-status":
        if (msg.type === "room-joined") {
          this.currentMapType = msg.data.mapType || "cyberpunk";
          this.setupScene();
        }

        if (msg.data.status === "ACTIVE") {
          this.showWarmupOverlay(false);
          if (!this.isMatchActive) this.startMatch(this.network, this.playerName, "ACTIVE");
        } else if (msg.data.status === "WARMUP") {
          this.showWarmupOverlay(true);
        }
        // Handle initial player list if joining
        if (msg.type === "room-joined" && msg.data.players) {
          msg.data.players.forEach((p: any) => {
            if (p.id !== this.localPlayerId) {
              this.updateRemotePlayer(p.id, p.name, null, null);
            }
          });
        }
        break;

      case "join":
        if (msg.senderId === this.localPlayerId) return;
        this.updateRemotePlayer(msg.data.id, msg.data.name, msg.data.position, msg.data.rotation, msg.data.weaponType, msg.data.kills);
        break;

      case "move":
        if (msg.senderId === this.localPlayerId) return;
        this.updateRemotePlayer(msg.senderId, msg.data.name, msg.data.position, msg.data.rotation, msg.data.weaponType);
        break;

      case "hit":
        if (msg.data.targetId === this.localPlayerId) {
          this.handleLocalHit(msg.data.damage, msg.senderId, msg.data.isHeadshot);
        }
        // Always trigger flinch for anyone hit
        this.triggerPlayerFlinch(msg.data.targetId, msg.data.isHeadshot);
        break;

      case "death":
        this.handleDeathMessage(msg.data.id, msg.data.name, msg.data.killerId, msg.data.killerName, msg.data.isHeadshot);
        this.updateScoreboard();
        break;

      case "shoot":
        if (msg.senderId !== this.localPlayerId) {
          this.handleRemoteShoot(msg.senderId);
        }
        break;

      case "disconnect":
        this.removeRemotePlayer(msg.data.id);
        this.updateScoreboard();
        break;
    }
    this.updatePlayerCount();
  }

  private updatePlayerCount() {
    const pc = document.getElementById("player-count");
    if (pc) {
      pc.innerText = `Players: ${this.remotePlayers.size + 1}`;
    }
  }

  private updateRemotePlayer(id: string, name: string, pos: any, rot: any, weaponType: string = "pistol", kills: number = 0) {
    let player = this.remotePlayers.get(id);
    if (!player) {
      player = new Player(id, name || `Player ${id}`);
      player.kills = kills;

      // Invisible Hitbox
      player.mesh = MeshBuilder.CreateBox(`player_${id}`, { width: 0.6, height: 2, depth: 0.6 }, this.scene);
      player.mesh.position.y = 1;
      player.mesh.visibility = 0; // Transparent but pickable

      // Invisible Head Hitbox (Visor)
      const visor = MeshBuilder.CreateBox(`visor_${id}`, { width: 0.4, height: 0.4, depth: 0.4 }, this.scene);
      visor.position.y = 0.7; // Positioned at head level
      visor.visibility = 0; // Transparent but pickable
      visor.parent = player.mesh;

      // Load 3D Model
      SceneLoader.ImportMesh("", "models/", "playermodle.glb", this.scene, (meshes, particleSystems, skeletons, animationGroups) => {
        if (!player!.mesh) return;

        // Stop all automatic animations and store them
        player!.animationGroups = animationGroups;
        animationGroups.forEach(ag => {
          console.log(`Animation Group found: ${ag.name}`);
          ag.stop();
        });

        // Find top level meshes (those with no parent in the loaded set)
        meshes.forEach(m => {
          if (!m.parent) {
            m.setParent(player!.mesh!);
          }
          m.isPickable = false;
        });

        // Initial defaults (will be overridden by debug or final values)
        const modelRoot = meshes[0];
        if (modelRoot) {
          // IMPORTANT: Babylon GLB loader uses rotationQuaternion by default.
          // We must null it to use the .rotation Vector3 from our debug utility.
          meshes.forEach(m => m.rotationQuaternion = null);

          modelRoot.scaling.setAll(1); // Reset to base 1 for debugging
          modelRoot.position.y = -1.7; // Updated as requested
          modelRoot.rotation.x = 0;
          modelRoot.rotation.y = 0; // Changed from Math.PI to fix "backwards" facing
          modelRoot.rotation.z = 0;

          // Tag it for the debug utility
          modelRoot.name = "DEBUG_PLAYER_MODEL";
        }
      });

      this.remotePlayers.set(id, player);
      this.createNametag(player.mesh, player.name);
    }

    if (player.mesh && pos) {
      player.mesh.setEnabled(true);
      player.targetPosition.set(pos.x, pos.y, pos.z);
      player.targetRotation.set(rot.x, rot.y, rot.z);

      if (pos.isFirst) {
        player.mesh.position.copyFrom(player.targetPosition);
        player.mesh.rotation.copyFrom(player.targetRotation);
      }
    }

    // Sync remote weapon
    if (player && weaponType && player.currentWeaponType !== weaponType) {
      this.updateRemotePlayerWeapon(player, weaponType);
    }
  }

  private updateRemotePlayerWeapon(player: Player, weaponType: string) {
    player.currentWeaponType = weaponType;

    // Dispose old weapon if any
    if (player.weaponMesh) {
      player.weaponMesh.dispose();
    }

    const config = WEAPON_CONFIGS[weaponType];
    if (!config) return;

    SceneLoader.ImportMesh("", "", config.modelPath, this.scene, (meshes) => {
      if (!player.mesh || player.isDead) {
        meshes.forEach(m => m.dispose());
        return;
      }

      // Create a clean root for the remote weapon
      const weaponRoot = new Mesh("remoteWeaponRoot", this.scene);
      weaponRoot.parent = player.mesh;

      // Applied values from final debug session:
      // Pos(-0.15, -0.45, 0.75), Rot(-0.19, 0.02, -2.12), ScaleMult: 2.4
      weaponRoot.position.set(-0.15, -0.45, 0.75);
      weaponRoot.rotation.set(-0.19, 0.02, -2.12);

      meshes.forEach(m => {
        // Simple parenting to avoid world-matrix compensation issues
        if (!m.parent || !meshes.includes(m.parent as AbstractMesh)) {
          m.parent = weaponRoot;
        }
        m.isPickable = false;
        m.rotationQuaternion = null;
        m.scaling.set(1, 1, 1); // Reset local scale to avoid inherited GLB scaling
      });

      weaponRoot.scaling.copyFrom(config.scale).scaleInPlace(2.4);

      player.weaponMesh = weaponRoot;
    });
  }

  private createNametag(mesh: Mesh, name: string) {
    const plane = MeshBuilder.CreatePlane("nametag", { size: 2 }, this.scene);
    plane.parent = mesh;
    plane.position.y = 1.5;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const tex = new DynamicTexture("nametagTexture", { width: 512, height: 256 }, this.scene);
    const material = new StandardMaterial("nametagMat", this.scene);
    material.diffuseTexture = tex;
    material.useAlphaFromDiffuseTexture = true;
    material.opacityTexture = tex;
    plane.material = material;

    tex.drawText(name, null, null, "bold 80px Arial", "white", "transparent", true);
  }

  private removeRemotePlayer(id: string) {
    const player = this.remotePlayers.get(id);
    if (player && player.mesh) {
      player.mesh.dispose();
    }
    this.remotePlayers.delete(id);
  }

  private handleLocalHit(damage: number, killerId: string, isHeadshot: boolean = false) {
    if (this.isDead) return;

    this.health -= damage;
    const hpUi = document.getElementById("hp-ui");
    if (hpUi) hpUi.innerText = `${Math.ceil(Math.max(0, this.health))}`;

    // Combat Feedback Effects
    const shakeIntensity = isHeadshot ? 0.4 : 0.15;
    this.weapon.triggerHitShake(shakeIntensity);

    // Damage Vignette
    const vignette = document.getElementById("damage-vignette");
    if (vignette) {
      vignette.classList.add("active");
      setTimeout(() => vignette.classList.remove("active"), 150);
    }

    // Directional Indicator
    const killer = this.remotePlayers.get(killerId);
    if (killer && killer.mesh) {
      this.showHitIndicator(killer.mesh.position);
    }

    if (this.health <= 0) {
      this.die(killerId);
    }
  }

  private showHitIndicator(sourcePos: Vector3) {
    const indicator = document.getElementById("hit-indicator");
    if (!indicator) return;

    // Calculate angle to source
    const playerPos = this.controller.camera.position;
    const playerRot = this.controller.camera.rotation.y;

    const dx = sourcePos.x - playerPos.x;
    const dz = sourcePos.z - playerPos.z;
    const angleToSource = Math.atan2(dx, dz);

    // Relative angle considering player's current looking direction
    const relativeAngle = angleToSource - playerRot;

    indicator.style.opacity = "1";
    indicator.style.transform = `translate(-50%, -50%) rotate(${relativeAngle}rad)`;

    setTimeout(() => {
      indicator.style.opacity = "0";
    }, 1000);
  }

  private die(killerId: string) {
    this.isDead = true;
    this.health = 0;

    // Notify network
    const killer = this.remotePlayers.get(killerId);
    const killerName = killer?.name || "Someone";

    // We don't have isHeadshot here easily unless passed to handleLocalHit.
    // Let's assume the server or killer sends the death message, but if we broadcast our death:
    this.network.send("death", { id: this.localPlayerId, name: this.playerName, killerId, killerName });

    this.showKillFeed(`${killerName} killed you!`);

    // Visual feedback
    const overlay = document.createElement("div");
    overlay.id = "death-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.color = "white";
    overlay.style.fontSize = "48px";
    overlay.style.fontFamily = "Arial";
    overlay.innerText = "YOU DIED\nRespawning in 3s...";
    document.body.appendChild(overlay);

    setTimeout(() => {
      this.respawn();
      document.body.removeChild(overlay);
    }, 3000);
  }

  private respawn() {
    this.isDead = false;
    this.health = 100;
    this.isHealing = false; // Reset healing on respawn
    const hpUi = document.getElementById("hp-ui");
    if (hpUi) hpUi.innerText = `HP: 100`;

    // Random ground position (expanded for original map)
    const randomX = (Math.random() - 0.5) * 40;
    const randomZ = (Math.random() - 0.5) * 40;
    this.controller.collider.position.set(randomX, 0.9, randomZ);
  }



  private spawnHealthPacks() {
    const spots = [
      new Vector3(15, 0.5, 15),
      new Vector3(-15, 0.5, -15),
      new Vector3(15, 0.5, -15),
      new Vector3(-15, 0.5, 15),
      new Vector3(0, 0.5, 0)
    ];
    spots.forEach(pos => {
      this.healthPacks.push(new HealthPack(this.scene, pos));
    });
  }

  private setupMinimap() {
    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.width = 150;
    this.minimapCanvas.height = 150;
    this.minimapCanvas.style.position = "absolute";
    this.minimapCanvas.style.top = "20px";
    this.minimapCanvas.style.left = "20px";
    this.minimapCanvas.style.border = "2px solid rgba(255,255,255,0.3)";
    this.minimapCanvas.style.borderRadius = "50%";
    this.minimapCanvas.style.backgroundColor = "rgba(0,0,0,0.5)";
    document.body.appendChild(this.minimapCanvas);
    this.minimapCtx = this.minimapCanvas.getContext("2d")!;
  }

  private drawMinimap() {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const ctx = this.minimapCtx;
    const size = 150;
    const half = size / 2;
    const scale = 2.5; // Controls zoom

    ctx.clearRect(0, 0, size, size);

    // Grid center
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(half, 0); ctx.lineTo(half, size);
    ctx.moveTo(0, half); ctx.lineTo(size, half);
    ctx.stroke();

    const localPos = this.controller.camera.position;

    // Draw Remote Players
    this.remotePlayers.forEach(p => {
      if (p.mesh) {
        this.drawOnMap(ctx, p.mesh.position, localPos, "blue", scale);
      }
    });

    // Draw Health Packs
    this.healthPacks.forEach(hp => {
      this.drawOnMap(ctx, hp.mesh.position, localPos, "green", scale);
    });

    // Draw Local Player (Center)
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(half, half, 4, 0, Math.PI * 2);
    ctx.fill();

    // Direction cone
    ctx.strokeStyle = "yellow";
    ctx.beginPath();
    const angle = this.controller.camera.rotation.y;
    ctx.moveTo(half, half);
    ctx.lineTo(half + Math.sin(angle) * 10, half + Math.cos(angle) * 10);
    ctx.stroke();
  }

  private drawOnMap(ctx: CanvasRenderingContext2D, target: Vector3, local: Vector3, color: string, scale: number) {
    const half = 75;
    const x = half + (target.x - local.x) * scale;
    const y = half - (target.z - local.z) * scale; // Canvas Y is inverted relative to world Z

    // Bounds check
    const dist = Math.sqrt(Math.pow(x - half, 2) + Math.pow(y - half, 2));
    if (dist > 70) return;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private handleDeathMessage(victimId: string, victimName: string, killerId: string, killerName: string, isHeadshot: boolean = false) {
    const headshotExtra = isHeadshot ? " 🎯 (HEADSHOT!)" : "";
    this.showKillFeed(`${killerName} eliminated ${victimName}${headshotExtra}`);

    if (killerId === this.localPlayerId) {
      this.kills++;
      const killsUi = document.getElementById("kills-ui");
      if (killsUi) killsUi.innerText = `Kills: ${this.kills}`;

      if (this.kills >= this.WIN_SCORE) {
        this.triggerVictory(killerName);
      }
    } else {
      const killer = this.remotePlayers.get(killerId);
      if (killer) {
        killer.kills++;
        if (killer.kills >= this.WIN_SCORE) {
          this.triggerVictory(killerName);
        }
      }
    }
    this.updateScoreboard();

    // Hide remote mesh if it was a player
    const remote = this.remotePlayers.get(victimId);
    if (remote && remote.mesh) {
      remote.mesh.setEnabled(false);
    }
  }

  private triggerVictory(winnerName: string) {
    if (this.gameOver) return;
    this.gameOver = true;
    localStorage.removeItem("lastRoomId"); // Match finished, clear reconnection
    this.controller.camera.detachControl();

    const overlay = document.createElement("div");
    overlay.style.position = "absolute"; overlay.style.top = "0"; overlay.style.left = "0";
    overlay.style.width = "100%"; overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.85)";
    overlay.style.color = "gold"; overlay.style.display = "flex";
    overlay.style.flexDirection = "column"; overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center"; overlay.style.zIndex = "2000";
    overlay.style.fontFamily = "Arial";
    overlay.innerHTML = `
        <h1 style="font-size: 80px; margin: 0; text-shadow: 0 0 20px gold;">VICTORY</h1>
        <h2 style="font-size: 40px; color: white;">${winnerName} DOMINATED</h2>
        <p style="color: #aaa; margin-top: 30px;">Restarting Match in 10s...</p>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => window.location.reload(), 10000);
  }

  private showKillFeed(message: string) {
    const feed = document.getElementById("kill-feed");
    if (!feed) return;

    const entry = document.createElement("div");
    entry.className = "kill-entry";
    entry.innerText = message;
    feed.prepend(entry);

    setTimeout(() => {
      entry.style.opacity = "0";
      setTimeout(() => { if (entry.parentNode) feed.removeChild(entry); }, 1000);
    }, 4000);
  }

  private createUI() {
    // Inject Premium HUD Styles
    const style = document.createElement("style");
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
      
      :root {
        --glass: rgba(0, 0, 0, 0.4);
        --glass-border: rgba(255, 255, 255, 0.1);
        --neon-cyan: #00f2ff;
        --neon-pink: #ff00ff;
        --neon-green: #00ff88;
        --hud-font: 'Inter', sans-serif;
      }

      .hud-pod {
        background: var(--glass);
        backdrop-filter: blur(10px);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 15px 25px;
        color: white;
        font-family: var(--hud-font);
        position: absolute;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        transition: all 0.3s ease;
      }

      .hud-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 5px;
        font-weight: 700;
      }

      .hud-value {
        font-size: 32px;
        font-weight: 900;
        line-height: 1;
      }

      .progress-container {
        width: 150px;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        margin-top: 10px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        width: 100%;
        transition: width 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      #hp-fill { background: linear-gradient(90deg, #ff416c, #ff4b2b); }
      #ammo-fill { background: linear-gradient(90deg, #00f2ff, #0061ff); }

      .kill-entry {
        background: linear-gradient(90deg, rgba(255,255,255,0.1), transparent);
        padding: 8px 15px;
        margin-bottom: 5px;
        border-left: 3px solid var(--neon-cyan);
        font-family: var(--hud-font);
        font-size: 14px;
        font-weight: 700;
        animation: slideIn 0.3s ease-out;
      }

      @keyframes slideIn {
        from { transform: translateX(-20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      #crosshair {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        background: #00ff88;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        box-shadow: 0 0 10px #00ff88;
      }

      .scoreboard-container {
        position: absolute;
        top: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 15px;
      }

      #damage-vignette {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        box-shadow: inset 0 0 100px rgba(255, 0, 0, 0);
        transition: box-shadow 0.1s ease-out;
        z-index: 1400;
      }

      #damage-vignette.active {
        box-shadow: inset 0 0 150px rgba(255, 0, 0, 0.8);
      }

      #hit-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100px;
        height: 100px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 1000;
      }

      .hit-arrow {
        position: absolute;
        top: 0;
        left: 50%;
        width: 0;
        height: 0;
        border-left: 20px solid transparent;
        border-right: 20px solid transparent;
        border-bottom: 30px solid rgba(255, 0, 0, 0.8);
        transform: translateX(-50%);
      }
      #hitmarker {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 30px;
        height: 30px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        display: none;
        z-index: 1001;
      }

      .hitmarker-line {
        position: absolute;
        width: 2px;
        height: 12px;
        background: white;
        border-radius: 1px;
      }

      .hm-1 { transform: translate(6px, 6px) rotate(45deg); }
      .hm-2 { transform: translate(-6px, 6px) rotate(-45deg); }
      .hm-3 { transform: translate(6px, -6px) rotate(-45deg); }
      .hm-4 { transform: translate(-6px, -6px) rotate(45deg); }

      #hitmarker.headshot .hitmarker-line {
        background: #ff0055;
        width: 3px;
        box-shadow: 0 0 10px rgba(255, 0, 85, 0.5);
      }

      @keyframes hitmarker-fade {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }

      .hitmarker-animate {
        animation: hitmarker-fade 0.15s ease-out forwards;
      }
    `;
    document.head.appendChild(style);

    // Crosshair
    const crosshair = document.createElement("div");
    crosshair.id = "crosshair";
    document.body.appendChild(crosshair);

    // Health Pod (Bottom Left)
    const healthPod = document.createElement("div");
    healthPod.className = "hud-pod";
    healthPod.style.bottom = "30px";
    healthPod.style.left = "30px";
    healthPod.innerHTML = `
      <div class="hud-label">Vitals</div>
      <div class="hud-value" id="hp-ui">100</div>
      <div class="progress-container">
        <div id="hp-fill" class="progress-fill"></div>
      </div>
    `;
    document.body.appendChild(healthPod);

    // Damage Vignette
    const vignette = document.createElement("div");
    vignette.id = "damage-vignette";
    document.body.appendChild(vignette);

    // Hit Indicator
    const hitIndicator = document.createElement("div");
    hitIndicator.id = "hit-indicator";
    hitIndicator.innerHTML = `<div class="hit-arrow"></div>`;
    document.body.appendChild(hitIndicator);

    // Hitmarker UI
    const hitmarker = document.createElement("div");
    hitmarker.id = "hitmarker";
    hitmarker.innerHTML = `
        <div class="hitmarker-line hm-1"></div>
        <div class="hitmarker-line hm-2"></div>
        <div class="hitmarker-line hm-3"></div>
        <div class="hitmarker-line hm-4"></div>
    `;
    document.body.appendChild(hitmarker);

    // Hit Sound
    this.hitSound = new Audio("/sounds/hit.mp3");
    this.hitSound.volume = 0.5;
    this.headshotSound = new Audio("/sounds/headshot.mp3");
    this.headshotSound.volume = 0.6;

    // Weapon Pod (Bottom Right)
    const weaponPod = document.createElement("div");
    weaponPod.className = "hud-pod";
    weaponPod.style.bottom = "30px";
    weaponPod.style.right = "30px";
    weaponPod.innerHTML = `
      <div class="hud-label" id="weapon-name-ui">Pistol</div>
      <div class="hud-value" id="weapon-ammo-ui">12 / 12</div>
      <div class="progress-container">
        <div id="ammo-fill" class="progress-fill"></div>
      </div>
    `;
    document.body.appendChild(weaponPod);

    // Kill Feed (Top Left)
    const feed = document.createElement("div");
    feed.id = "kill-feed";
    feed.style.position = "absolute";
    feed.style.top = "100px";
    feed.style.left = "30px";
    feed.style.pointerEvents = "none";
    document.body.appendChild(feed);

    // Scoreboard Container (Top Right)
    const scoreContainer = document.createElement("div");
    scoreContainer.className = "scoreboard-container";

    // Player Count & Stats
    const stats = document.createElement("div");
    stats.className = "hud-pod";
    stats.style.position = "static";
    stats.style.padding = "10px 20px";
    stats.innerHTML = `
      <div style="display: flex; gap: 20px;">
        <div><span class="hud-label">Players</span><div id="player-count" style="font-size: 18px; font-weight: 900;">1</div></div>
        <div><span class="hud-label">Your Kills</span><div id="kills-ui" style="font-size: 18px; font-weight: 900; color: gold;">0</div></div>
      </div>
    `;
    scoreContainer.appendChild(stats);

    // Scoreboard
    const scoreboard = document.createElement("div");
    scoreboard.id = "scoreboard";
    scoreboard.className = "hud-pod";
    scoreboard.style.position = "static";
    scoreboard.style.minWidth = "200px";
    scoreboard.style.padding = "15px";
    scoreContainer.appendChild(scoreboard);

    document.body.appendChild(scoreContainer);
    this.updateScoreboard();

    // Progress Loader (for Reload & Heal) - Integrated into center
    const loaderContainer = document.createElement("div");
    loaderContainer.id = "loader-ui";
    loaderContainer.style.bottom = "140px";
    loaderContainer.style.left = "50%";
    loaderContainer.style.transform = "translateX(-50%)";
    loaderContainer.style.width = "250px";
    loaderContainer.style.height = "6px";
    loaderContainer.style.background = "rgba(0,0,0,0.5)";
    loaderContainer.style.borderRadius = "3px";
    loaderContainer.style.display = "none";
    loaderContainer.style.zIndex = "1000";
    loaderContainer.style.position = "absolute"; // Added missing position

    const loaderBar = document.createElement("div");
    loaderBar.id = "loader-bar";
    loaderBar.style.width = "0%";
    loaderBar.style.height = "100%";
    loaderBar.style.borderRadius = "3px";
    loaderContainer.appendChild(loaderBar);

    const loaderText = document.createElement("div");
    loaderText.id = "loader-text";
    loaderText.style.position = "absolute";
    loaderText.style.top = "-25px";
    loaderText.style.width = "100%";
    loaderText.style.textAlign = "center";
    loaderText.style.color = "white";
    loaderText.style.fontFamily = "var(--hud-font)";
    loaderText.style.fontSize = "12px";
    loaderText.style.fontWeight = "900";
    loaderText.style.letterSpacing = "2px";
    loaderContainer.appendChild(loaderText);

    document.body.appendChild(loaderContainer);

    // Sniper Scope Overlay
    const scope = document.createElement("div");
    scope.id = "scope-overlay";
    scope.style.position = "absolute";
    scope.style.top = "0";
    scope.style.left = "0";
    scope.style.width = "100%";
    scope.style.height = "100%";
    // Larger premium radial gradient
    scope.style.background = "radial-gradient(circle at center, transparent 1200px, rgba(0,0,0,0.95) 1205px, black 1250px)";
    scope.style.display = "none";
    scope.style.zIndex = "1500";
    scope.style.pointerEvents = "none";

    // Crosshair Lines and Lens Border
    scope.innerHTML = `
        <div style="position: absolute; width: 1px; height: 100%; height: 100vh; background: rgba(255,255,255,0.5); left: 50%; top: 0; transform: translateX(-50%);"></div>
        <div style="position: absolute; width: 100%; width: 100vw; height: 1px; background: rgba(255,255,255,0.5); top: 50%; left: 0; transform: translateY(-50%);"></div>
        <div style="position: absolute; width: 1200px; height: 1200px; border: 2px solid rgba(255,255,255,0.7); border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 30px rgba(0,0,0,1) inset;"></div>
        <div style="position: absolute; width: 12px; height: 12px; background: red; border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.8;"></div>
    `;
    document.body.appendChild(scope);

    // Settings (moved to be after all other UI elements)
    const settings = document.createElement("div");
    settings.style.position = "absolute";
    settings.style.bottom = "20px";
    settings.style.right = "20px";
    settings.style.backgroundColor = "rgba(0,0,0,0.6)";
    settings.style.padding = "10px";
    settings.style.borderRadius = "5px";
    settings.style.color = "white";
    settings.style.fontFamily = "Arial";
    settings.style.fontSize = "14px";
    settings.innerHTML = `
        <div style="margin-bottom: 5px;">Sensitivity</div>
        <input type="range" id="sens-slider" min="1" max="60" value="24" style="cursor: pointer;">
    `;
    document.body.appendChild(settings);

    const slider = document.getElementById("sens-slider") as HTMLInputElement;
    slider.addEventListener("input", () => {
      this.controller.setSensitivity(parseFloat(slider.value));
    });
    // Set initial
    this.controller.setSensitivity(6);
  }

  private updateScoreboard() {
    const sb = document.getElementById("scoreboard");
    if (!sb) return;

    let html = "<div style='font-weight: bold; font-size: 20px; border-bottom: 2px solid white; margin-bottom: 10px;'>SCOREBOARD</div>";

    // Add local player
    html += `<div style='display: flex; justify-content: space-between; margin-bottom: 5px; color: var(--neon-green);'>
                <span>${this.playerName} (YOU)</span>
                <span>${this.kills}</span>
            </div>`;

    // Add remote players
    this.remotePlayers.forEach(p => {
      html += `<div style='display: flex; justify-content: space-between; margin-bottom: 5px;'>
                    <span>${p.name}</span>
                    <span>${p.kills}</span>
                </div>`;
    });

    sb.innerHTML = html;
  }

  public update() {
    if (!this.isMatchActive || this.isDead || this.gameOver) return;

    const deltaTime = this.scene.getEngine().getDeltaTime();
    this.controller.update();
    this.healthPacks.forEach(hp => hp.update());
    this.checkHealthPackCollisions();
    this.weapon.update(deltaTime);

    // Update Healing
    if (this.isHealing) {
      const now = Date.now();
      const elapsed = now - this.healingStartTime;
      this.healingProgress = Math.min(elapsed / this.HEAL_TIME, 1);

      if (this.healingProgress >= 1) {
        this.isHealing = false;
        this.health = 100;
        this.showKillFeed("HEALED TO 100");
      }
    }

    // Update Progress UI
    const hpUi = document.getElementById("hp-ui");
    const hpFill = document.getElementById("hp-fill");
    if (hpUi) hpUi.innerText = `${Math.ceil(this.health)}`;
    if (hpFill) hpFill.style.width = `${Math.max(0, this.health)}%`;

    const loaderUi = document.getElementById("loader-ui");
    const loaderBar = document.getElementById("loader-bar");
    const loaderText = document.getElementById("loader-text");

    if (this.isHealing) {
      if (loaderUi) loaderUi.style.display = "block";
      if (loaderBar) {
        loaderBar.style.width = `${this.healingProgress * 100}%`;
        loaderBar.style.background = "var(--neon-green)";
      }
      if (loaderText) loaderText.innerText = "HEALING...";
    } else if (this.weapon.isReloading) {
      if (loaderUi) loaderUi.style.display = "block";
      if (loaderBar) {
        loaderBar.style.width = `${this.weapon.reloadProgress * 100}%`;
        loaderBar.style.background = "var(--neon-cyan)";
      }
      if (loaderText) loaderText.innerText = "RELOADING...";
    } else {
      if (loaderUi) loaderUi.style.display = "none";
    }

    // Shooting logic
    if (this.isShooting && !this.isDead && !this.gameOver && !this.isHealing) {
      if (this.network) {
        this.weapon.shoot((targetId: string, damage: number, isHeadshot: boolean) => {
          this.network.send("hit", { targetId, damage, killerId: this.localPlayerId, isHeadshot });

          // Attacker Feedback
          this.showHitmarker(isHeadshot);
          if (isHeadshot) this.showKillFeed("HEADSHOT!");
        });
        // Broadcast shoot event
        this.network.send("shoot", {});
      }
    }

    // Smoothly interpolate remote players and handle animations
    this.remotePlayers.forEach(p => {
      if (p.mesh && p.mesh.isEnabled()) {
        const dist = Vector3.Distance(p.mesh.position, p.targetPosition);

        p.mesh.position = Vector3.Lerp(p.mesh.position, p.targetPosition, 0.15);
        p.mesh.rotation.y = this.lerpAngle(p.mesh.rotation.y, p.targetRotation.y, 0.15);

        // Animation logic based on distance moved (interpolated velocity)
        const isMoving = dist > 0.02;
        this.updatePlayerAnimations(p, isMoving);
      }
    });

    // Broadcast position
    const now = Date.now();
    if (this.localPlayerId && this.network && now - this.lastMoveTime > 30) {
      this.lastMoveTime = now;
      const pos = this.controller.collider.position;
      const rot = this.controller.camera.rotation;

      this.network.send("move", {
        name: this.playerName,
        position: { x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)), z: Number(pos.z.toFixed(2)) },
        rotation: { x: Number(rot.x.toFixed(2)), y: Number(rot.y.toFixed(2)), z: Number(rot.z.toFixed(2)) },
        weaponType: this.weapon.currentType
      });
    }

    this.drawMinimap();

    // Update Weapon UI
    const weaponNameUi = document.getElementById("weapon-name-ui");
    const weaponAmmoUi = document.getElementById("weapon-ammo-ui");
    const ammoFill = document.getElementById("ammo-fill");

    if (weaponNameUi) weaponNameUi.innerText = this.weapon.config.name;
    if (weaponAmmoUi) {
      if (this.weapon.isReloading) {
        weaponAmmoUi.innerText = "RELOADING...";
      } else {
        weaponAmmoUi.innerText = `${this.weapon.ammo} / ${this.weapon.config.maxAmmo}`;
      }
    }
    if (ammoFill) {
      const ammoPct = (this.weapon.ammo / this.weapon.config.maxAmmo) * 100;
      ammoFill.style.width = `${ammoPct}%`;
    }
  }

  private startHealing() {
    if (this.health >= 100 || this.isHealing || this.isDead) return;
    this.isHealing = true;
    this.healingStartTime = Date.now();
    this.healingProgress = 0;

    // Stop shooting and zoom when healing
    this.isShooting = false;
    this.weapon.toggleZoom(false);
    this.updateZoomSensitivity();
  }

  private togglePlayerDebug() {
    const existing = document.getElementById("player-debug-ui");
    if (existing) {
      existing.style.display = existing.style.display === "none" ? "block" : "none";
      return;
    }

    const gui = document.createElement("div");
    gui.id = "player-debug-ui";
    gui.style.position = "absolute";
    gui.style.top = "100px";
    gui.style.left = "300px";
    gui.style.backgroundColor = "rgba(0,0,0,0.8)";
    gui.style.color = "white";
    gui.style.padding = "20px";
    gui.style.zIndex = "2000";
    gui.style.fontFamily = "Arial";
    gui.style.borderRadius = "10px";
    gui.style.width = "250px";

    gui.innerHTML = `
      <h3 style="margin-top:0">Player Model Debug</h3>
      <div style="margin-bottom:15px">
        <label>Scale: <span id="v-scale">1</span></label><br/>
        <input type="range" id="s-scale" min="0.01" max="100" step="0.01" value="1" style="width:100%">
      </div>
      <div style="margin-bottom:15px">
        <label>Y Offset: <span id="v-y"> -1.7</span></label><br/>
        <input type="range" id="s-y" min="-5" max="5" step="0.1" value="-1.7" style="width:100%">
      </div>
      <div style="margin-bottom: 10px">
        <label>Rot X: <span id="v-rot-x">0</span></label><br/>
        <input type="range" id="s-rot-x" min="-6.28" max="6.28" step="0.01" value="0" style="width:100%">
      </div>
      <div style="margin-bottom: 10px">
        <label>Rot Y: <span id="v-rot-y">3.14</span></label><br/>
        <input type="range" id="s-rot-y" min="-6.28" max="6.28" step="0.01" value="3.14" style="width:100%">
      </div>
      <div style="margin-bottom: 15px">
        <label>Rot Z: <span id="v-rot-z">0</span></label><br/>
        <input type="range" id="s-rot-z" min="-6.28" max="6.28" step="0.01" value="0" style="width:100%">
      </div>
      <button id="p-print" style="width:100%; padding:10px; cursor:pointer">Print to Console</button>
    `;

    document.body.appendChild(gui);

    const updateLabel = (id: string, val: any) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val.toString();
    };

    const apply = () => {
      const scale = parseFloat((document.getElementById("s-scale") as HTMLInputElement).value);
      const y = parseFloat((document.getElementById("s-y") as HTMLInputElement).value);
      const rx = parseFloat((document.getElementById("s-rot-x") as HTMLInputElement).value);
      const ry = parseFloat((document.getElementById("s-rot-y") as HTMLInputElement).value);
      const rz = parseFloat((document.getElementById("s-rot-z") as HTMLInputElement).value);

      updateLabel("v-scale", scale);
      updateLabel("v-y", y);
      updateLabel("v-rot-x", rx);
      updateLabel("v-rot-y", ry);
      updateLabel("v-rot-z", rz);

      // Apply to all currently loaded remote player roots
      this.scene.meshes.forEach(m => {
        if (m.name === "DEBUG_PLAYER_MODEL") {
          m.scaling.setAll(scale);
          m.position.y = y;
          m.rotation.x = rx;
          m.rotation.y = ry;
          m.rotation.z = rz;
        }
      });
    };

    gui.addEventListener("input", apply);
    document.getElementById("p-print")?.addEventListener("click", () => {
      const scale = (document.getElementById("s-scale") as HTMLInputElement).value;
      const y = (document.getElementById("s-y") as HTMLInputElement).value;
      const rx = (document.getElementById("s-rot-x") as HTMLInputElement).value;
      const ry = (document.getElementById("s-rot-y") as HTMLInputElement).value;
      const rz = (document.getElementById("s-rot-z") as HTMLInputElement).value;
      console.log(`FINAL PLAYER TRANSFORMS: scale: ${scale}, y: ${y}, rot: (${rx}, ${ry}, ${rz})`);
      alert(`Scale: ${scale}, Y: ${y}, Rot: (${rx}, ${ry}, ${rz})`);
    });
  }

  private showHitmarker(isHeadshot: boolean) {
    const hm = document.getElementById("hitmarker");
    if (!hm) return;

    hm.style.display = "block";
    hm.className = isHeadshot ? "headshot hitmarker-animate" : "hitmarker-animate";

    // Sound
    if (isHeadshot) {
      this.headshotSound.currentTime = 0;
      this.headshotSound.play().catch(() => { });
    } else {
      this.hitSound.currentTime = 0;
      this.hitSound.play().catch(() => { });
    }

    // Reset animation
    setTimeout(() => {
      hm.style.display = "none";
      hm.classList.remove("hitmarker-animate");
    }, 150);
  }

  private handleRemoteShoot(senderId: string) {
    const player = this.remotePlayers.get(senderId);
    if (!player || !player.weaponMesh) return;

    // Trigger visual shake on the gun
    const originalPos = player.weaponMesh.position.clone();
    const intensity = 0.05;

    player.weaponMesh.position.addInPlace(new Vector3(
      (Math.random() - 0.5) * intensity,
      (Math.random() - 0.5) * intensity,
      (Math.random() - 0.5) * intensity
    ));

    // Muzzle Flash Effect
    const flash = MeshBuilder.CreateSphere("remoteMuzzleFlash", { diameter: 0.15 }, this.scene);
    flash.parent = player.weaponMesh;
    flash.position.set(0, 0, 0.4); // Position at tip (roughly)

    const flashMat = new StandardMaterial("remoteFlashMat", this.scene);
    flashMat.emissiveColor = new Color3(1, 0.8, 0);
    flash.material = flashMat;

    setTimeout(() => {
      if (player.weaponMesh) player.weaponMesh.position.copyFrom(originalPos);
      flash.dispose();
    }, 50);
  }

  private triggerPlayerFlinch(targetId: string, isHeadshot: boolean) {
    const player = targetId === this.localPlayerId ? null : this.remotePlayers.get(targetId);
    if (!player || !player.mesh) return;

    // Apply brief jitter/flinch
    const originalPos = player.mesh.position.clone();
    const intensity = isHeadshot ? 0.2 : 0.1;

    player.mesh.position.addInPlace(new Vector3(
      (Math.random() - 0.5) * intensity,
      (Math.random() - 0.5) * intensity,
      (Math.random() - 0.5) * intensity
    ));

    // Optional: Flash red? 
    // We could temporarily change material but that might interfere with GLB textures.
    // For now, let's just stick to the physical flinch.

    setTimeout(() => {
      if (player.mesh) player.mesh.position.copyFrom(originalPos);
    }, 50);
  }

  private updatePlayerAnimations(player: Player, isMoving: boolean) {
    const targetSet = isMoving ? "Walk" : "Idle";
    if (player.currentAnimation === targetSet) return;

    player.currentAnimation = targetSet;

    // Stop all current
    player.animationGroups.forEach(ag => ag.stop());

    // Find best match for walking or idle
    const match = player.animationGroups.find(ag => {
      const name = ag.name.toLowerCase();
      if (isMoving) {
        return name.includes("walk") || name.includes("run") || name.includes("move");
      } else {
        return name.includes("idle") || name.includes("static") || name.includes("stay");
      }
    });

    if (match) {
      match.play(true); // Loop
    } else if (player.animationGroups.length > 0) {
      // Fallback: If no match, play the first one if moving, or nothing if idle
      if (isMoving) player.animationGroups[0].play(true);
    }
  }

  private checkHealthPackCollisions() {
    const pos = this.controller.collider.position;
    for (let i = this.healthPacks.length - 1; i >= 0; i--) {
      if (Vector3.Distance(pos, this.healthPacks[i].mesh.position) < 1.5) {
        this.health = Math.min(100, this.health + 50);
        const hpUi = document.getElementById("hp-ui");
        if (hpUi) hpUi.innerText = `HP: ${this.health}`;
        this.healthPacks[i].dispose();
        this.healthPacks.splice(i, 1);
        this.showKillFeed("+50 HEALTH");
      }
    }
  }

  // Helper to lerp angles correctly (handling 0 to 360 wrap)
  private lerpAngle(start: number, end: number, amount: number): number {
    let difference = end - start;
    while (difference < -Math.PI) difference += Math.PI * 2;
    while (difference > Math.PI) difference -= Math.PI * 2;
    return start + difference * amount;
  }
}

