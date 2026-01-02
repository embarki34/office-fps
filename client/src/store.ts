import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'

interface GameState {
    playerName: string;
    sensitivity: number;
    setPlayerName: (name: string) => void;
    setSensitivity: (sens: number) => void;
}

export const useGameStore = createStore<GameState>()(
    persist(
        (set) => ({
            playerName: "Agent_" + Math.floor(Math.random() * 1000),
            sensitivity: 6,
            setPlayerName: (name) => set({ playerName: name }),
            setSensitivity: (sens) => set({ sensitivity: sens }),
        }),
        {
            name: 'game-storage', // unique name
            storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
        },
    ),
)
