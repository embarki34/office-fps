import { Engine } from "@babylonjs/core";
import { Game } from "./Game";
import { Network } from "./Network";
import { MenuSystem } from "./MenuSystem";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

// 1. Setup Network for Lobby
const network = new Network((msg) => { }); // Initial dummy callback
network.connect();

// 2. Initialize Game (but don't follow old setupNetwork loop)
const game = new Game(engine, canvas);

// 3. Setup Menu
const menu = new MenuSystem(network, (roomId, status) => {
  // When a room is joined via Menu:
  const playerName = localStorage.getItem("playerName") || "Guest";
  game.startMatch(network, playerName, status);
});

engine.runRenderLoop(() => {
  game.update();
  game.scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
