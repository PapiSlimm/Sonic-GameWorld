import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Cpu, 
  Crosshair, 
  Activity, 
  ChevronRight, 
  Users, 
  Plane, 
  Truck, 
  Maximize2, 
  Minimize2, 
  Flame 
} from 'lucide-react';

import { useGameStore } from './store/gameStore';
import { gameRenderer } from './renderer/GameRenderer';
import { GameEngine } from './engine/GameEngine';
import { InputHandler } from './input/InputHandler';
import { UnitProduction } from './engine/UnitProduction';
import { CommanderAI } from './engine/CommanderAI';
import { UNIT_STATS, CELL_SIZE, GRID_WIDTH, GRID_HEIGHT } from './constants';
import { Faction, Building, SotoliumNode, Unit, UnitState } from './types';
import { Minimap } from './components/Minimap';

export default function App() {
  const economy = useGameStore(s => s.economy);
  const selectedFaction = useGameStore(s => s.input.selectedFaction);
  const winner = useGameStore(s => s.winner);
  const view = useGameStore(s => s.input.view);
  const viewMode = useGameStore(s => s.input.viewMode);
  const units = useGameStore(s => s.entities.units);
  const sessionTime = useGameStore(s => s.sessionTime);
  const productionQueue = useGameStore(s => s.productionQueue);
  const notifications = useGameStore(s => s.notifications);
  const focusedEntityId = useGameStore(s => s.input.focusedEntityId);

  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }, end: { x: number; y: number } } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  // Initialize RTS Systems
  useEffect(() => {
    if (!containerRef.current) return;
    
    InputHandler.init();
    
    let animationId: number;
    const init = async () => {
      await gameRenderer.init(containerRef.current!);
      
      const loop = (time: number) => {
        GameEngine.update(time);
        UnitProduction.update(time);
        CommanderAI.update(time);
        InputHandler.updateFPS(1/60, time);
        gameRenderer.update(time);
        animationId = requestAnimationFrame(loop);
      };
      animationId = requestAnimationFrame(loop);
    };

    init();

    // Create Initial Buildings
    const initialBuildings: Building[] = [
      // Raven Alliance Base Structures
      {
        id: 'raven-hq',
        faction: Faction.Raven,
        class: 'Radar',
        position: { x: 3, y: 3 },
        size: { w: 2, h: 2 },
        health: 1500,
        maxHealth: 1500,
        isOperational: true,
      },
      {
        id: 'raven-barracks',
        faction: Faction.Raven,
        class: 'Barracks',
        position: { x: 3, y: 7 },
        size: { w: 2, h: 2 },
        health: 1000,
        maxHealth: 1000,
        isOperational: true,
      },
      {
        id: 'raven-factory',
        faction: Faction.Raven,
        class: 'Factory',
        position: { x: 7, y: 3 },
        size: { w: 3, h: 3 },
        health: 1500,
        maxHealth: 1500,
        isOperational: true,
      },
      {
        id: 'raven-airfield',
        faction: Faction.Raven,
        class: 'Airfield',
        position: { x: 7, y: 7 },
        size: { w: 3, h: 3 },
        health: 1200,
        maxHealth: 1200,
        isOperational: true,
      },
      // United Dragon Nations Base Structures
      {
        id: 'dragon-hq',
        faction: Faction.Dragon,
        class: 'Radar',
        position: { x: 45, y: 45 },
        size: { w: 2, h: 2 },
        health: 1500,
        maxHealth: 1500,
        isOperational: true,
      },
      {
        id: 'dragon-barracks',
        faction: Faction.Dragon,
        class: 'Barracks',
        position: { x: 45, y: 41 },
        size: { w: 2, h: 2 },
        health: 1000,
        maxHealth: 1000,
        isOperational: true,
      },
      {
        id: 'dragon-factory',
        faction: Faction.Dragon,
        class: 'Factory',
        position: { x: 40, y: 41 },
        size: { w: 3, h: 3 },
        health: 1500,
        maxHealth: 1500,
        isOperational: true,
      }
    ];

    // Build raw occupancy bitmask
    const occupancy = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    initialBuildings.forEach(b => {
      for (let dx = 0; dx < b.size.w; dx++) {
        for (let dy = 0; dy < b.size.h; dy++) {
          const gx = b.position.x + dx;
          const gy = b.position.y + dy;
          if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
            occupancy[gy * GRID_WIDTH + gx] = 1;
          }
        }
      }
    });

    // Create sotolium resource nodes across the middle valley
    const resources: SotoliumNode[] = [
      { id: 'node-0', position: { x: 600, y: 700 }, amount: 5000, isBeingHarvested: false },
      { id: 'node-1', position: { x: 1400, y: 1300 }, amount: 5000, isBeingHarvested: false },
      { id: 'node-2', position: { x: 1000, y: 1000 }, amount: 5000, isBeingHarvested: false },
      { id: 'node-3', position: { x: 800, y: 1200 }, amount: 5000, isBeingHarvested: false },
      { id: 'node-4', position: { x: 1200, y: 800 }, amount: 5000, isBeingHarvested: false },
    ];

    // Initial deployment units
    const initialUnits: Unit[] = [
      // Friendly Raven forces
      {
        id: 'raven-inf-1',
        faction: Faction.Raven,
        class: 'Infantry',
        state: UnitState.Idle,
        transform: { x: 260, y: 320, rotation: 0 },
        velocity: { x: 0, y: 0 },
        path: [],
        health: 100,
        maxHealth: 100,
        speed: 2.2,
        attackRange: 160,
        damage: 12,
        detectionRadius: 200,
        commands: [],
        targetNodeId: null,
        lastFired: 0,
        harvestedSotolium: 0,
        heat: 0,
        visibility: 1.0,
        isDetected: true,
        isSelected: false,
      },
      {
        id: 'raven-inf-2',
        faction: Faction.Raven,
        class: 'Infantry',
        state: UnitState.Idle,
        transform: { x: 280, y: 280, rotation: 0 },
        velocity: { x: 0, y: 0 },
        path: [],
        health: 100,
        maxHealth: 100,
        speed: 2.2,
        attackRange: 160,
        damage: 12,
        detectionRadius: 200,
        commands: [],
        targetNodeId: null,
        lastFired: 0,
        harvestedSotolium: 0,
        heat: 0,
        visibility: 1.0,
        isDetected: true,
        isSelected: false,
      },
      {
        id: 'raven-tank-1',
        faction: Faction.Raven,
        class: 'Armored',
        state: UnitState.Idle,
        transform: { x: 380, y: 240, rotation: 0 },
        velocity: { x: 0, y: 0 },
        path: [],
        health: 400,
        maxHealth: 400,
        speed: 1.4,
        attackRange: 240,
        damage: 40,
        detectionRadius: 250,
        commands: [],
        targetNodeId: null,
        lastFired: 0,
        harvestedSotolium: 0,
        heat: 0,
        visibility: 1.0,
        isDetected: true,
        isSelected: false,
      },
      {
        id: 'raven-f-1',
        faction: Faction.Raven,
        class: 'Air',
        state: UnitState.Idle,
        transform: { x: 350, y: 350, rotation: 0 },
        velocity: { x: 0, y: 0 },
        path: [],
        health: 220,
        maxHealth: 220,
        speed: 3.0,
        attackRange: 300,
        damage: 30,
        detectionRadius: 320,
        commands: [],
        targetNodeId: null,
        lastFired: 0,
        harvestedSotolium: 0,
        heat: 0,
        visibility: 1.0,
        isDetected: true,
        isSelected: false,
      },
      // Opponent Dragon troops
      {
        id: 'dragon-inf-1',
        faction: Faction.Dragon,
        class: 'Infantry',
        state: UnitState.Idle,
        transform: { x: 1740, y: 1740, rotation: 0 },
        velocity: { x: 0, y: 0 },
        path: [],
        health: 100,
        maxHealth: 100,
        speed: 2.2,
        attackRange: 160,
        damage: 12,
        detectionRadius: 200,
        commands: [],
        targetNodeId: null,
        lastFired: 0,
        harvestedSotolium: 0,
        heat: 0,
        visibility: 1.0,
        isDetected: false,
        isSelected: false,
      },
      {
        id: 'dragon-tank-1',
        faction: Faction.Dragon,
        class: 'Armored',
        state: UnitState.Idle,
        transform: { x: 1680, y: 1780, rotation: 0 },
        velocity: { x: 0, y: 0 },
        path: [],
        health: 400,
        maxHealth: 400,
        speed: 1.4,
        attackRange: 240,
        damage: 40,
        detectionRadius: 250,
        commands: [],
        targetNodeId: null,
        lastFired: 0,
        harvestedSotolium: 0,
        heat: 0,
        visibility: 1.0,
        isDetected: false,
        isSelected: false,
      },
    ];

    useGameStore.getState().setStoreState({
      entities: {
        units: initialUnits,
        buildings: initialBuildings,
        resources: resources,
        projectiles: []
      },
      map: {
        width: 2000,
        height: 2000,
        gridSize: CELL_SIZE,
        occupancy,
        visibility: {}
      }
    });

    useGameStore.getState().addNotification('Neural network interfaces loaded successfully.', 'info');
    useGameStore.getState().addNotification('Raven Alliance base setup complete. Awaiting direct command input.', 'warning');

    return () => {
      cancelAnimationFrame(animationId);
      gameRenderer.destroy();
    };
  }, []);

  // UI Event Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === 'FPS') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Left click initializes selection boxes
    if (e.button === 0) {
      setSelectionBox({ start: { x, y }, end: { x, y } });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (selectionBox) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSelectionBox(prev => prev ? { ...prev, end: { x: e.clientX - rect.left, y: e.clientY - rect.top } } : null);
    }
  };

  const handleMouseUp = () => {
    if (selectionBox) {
      const x1 = Math.min(selectionBox.start.x, selectionBox.end.x);
      const y1 = Math.min(selectionBox.start.y, selectionBox.end.y);
      const x2 = Math.max(selectionBox.start.x, selectionBox.end.x);
      const y2 = Math.max(selectionBox.start.y, selectionBox.end.y);

      const dx = Math.abs(x1 - x2);
      const dy = Math.abs(y1 - y2);

      useGameStore.getState().updateUnits(allUnits => {
        allUnits.forEach(u => {
          if (u.state === UnitState.Dead) return;
          if (dx < 5 && dy < 5) {
            // Precise target point click (handles single unit selection)
            const d = Math.sqrt(Math.pow(u.transform.x - x1, 2) + Math.pow(u.transform.y - y1, 2));
            u.isSelected = u.faction === selectedFaction && d < 25;
          } else {
            // Area boundary lasso selection matches
            u.isSelected = u.faction === selectedFaction &&
              u.transform.x >= x1 && u.transform.x <= x2 &&
              u.transform.y >= y1 && u.transform.y <= y2;
          }
        });
      });
      setSelectionBox(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = e.clientX - rect.left;
    const worldY = e.clientY - rect.top;
    
    InputHandler.handleRTSCommand(worldX, worldY);
  };

  const selfDestructSelected = () => {
    useGameStore.getState().updateUnits(allUnits => {
      allUnits.forEach(u => {
        if (u.isSelected && u.state !== UnitState.Dead) {
          u.health = 0;
        }
      });
    });
    useGameStore.getState().addNotification('Tactical decommissioning sequence completed.', 'danger');
  };

  if (winner) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl">
        <motion.div 
          initial={{ scale: 0.85, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          className="text-center space-y-8 p-12 border border-white/10 bg-black/60 shadow-2xl rounded"
        >
          <h2 className={`text-6xl font-black tracking-tighter ${winner === Faction.Raven ? 'text-blue-500' : 'text-red-500'}`}>
            {winner === Faction.Raven ? 'RAVEN ALLIANCE DOMINANT' : 'DRAGON NATIONS VICTORIOUS'}
          </h2>
          <p className="text-white/50 text-sm max-w-md mx-auto">
            All primary hostile targets are neutralized. Sector operations are finalized.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-8 py-3 bg-white text-black font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all cursor-pointer text-xs"
          >
            RE-ENGAGE SYSTEMS
          </button>
        </motion.div>
      </div>
    );
  }

  if (view === 'Splash') {
    return (
      <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center justify-center bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#0d0e14_0%,#020204_100%)] opacity-80" />
        <div className="relative z-10 flex flex-col items-center gap-12 text-center p-8">
          <div className="space-y-4">
            <motion.div 
              initial={{ y: 20, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              transition={{ delay: 0.1 }}
              className="text-emerald-400 font-mono tracking-[0.3em] text-xs uppercase"
            >
              Neural Link Established v2.0
            </motion.div>
            <h1 className="text-6xl md:text-8xl tracking-widest font-black text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.15)] uppercase">
              Global Dominance
            </h1>
            <p className="text-white/40 max-w-xl mx-auto text-xs font-mono tracking-wide">
              Simulated Tactical Command & Control Interface. Deploy units, harvest Sotolium nodes, and direct forces using advanced steering separation behaviors.
            </p>
          </div>
          <button 
            onClick={() => useGameStore.getState().setGameState({ input: { ...useGameStore.getState().input, view: 'Game' } })} 
            className="group relative px-16 py-4.5 bg-white text-black font-mono text-xs tracking-[0.25em] font-black overflow-hidden transition-all cursor-pointer"
          >
            <div className="absolute inset-0 bg-blue-600 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
            <span className="relative z-10 group-hover:text-white transition-colors duration-300 uppercase">Initialize Theater of Operations</span>
          </button>
        </div>
      </div>
    );
  }

  const selectedUnitsList = units.filter(u => u.isSelected && u.state !== UnitState.Dead);

  return (
    <div className="relative w-screen h-screen tech-grid overflow-hidden flex flex-col bg-[#030306] text-white">
      <div className="scanline absolute inset-0 z-50 pointer-events-none opacity-20" />
      
      {/* Top Bar HUD */}
      <div className="h-16 hud-panel flex items-center justify-between px-8 z-40 border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
             <span className="text-sm font-black tracking-widest text-white uppercase flex items-center gap-2">
               <Shield size={14} className="text-blue-500 animate-pulse" />
               SYS_LINK <span className="text-[10px] text-white/40 font-mono">058-TACTICAL</span>
             </span>
             <span className="text-[8px] text-blue-400 font-mono uppercase tracking-wider">ALLIANCE NETWORK LINK STATUS: GREEN</span>
          </div>
          
          <div className="h-8 w-px bg-white/10" />

          <div className="grid grid-cols-2 gap-8">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-white/40 font-mono tracking-widest">Sotolium Credits</span>
              <span className="font-mono text-base text-yellow-400 font-bold">
                ${Math.floor(economy[selectedFaction].credits).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
             <span className="text-[8px] text-white/40 font-mono uppercase tracking-widest">SYSTEM DATE TIMER</span>
             <span className="text-xs font-mono text-emerald-400">
               {new Date(sessionTime * 1000).toISOString().substring(11, 19)}
             </span>
          </div>
          
          {/* Tactical View Switcher */}
          <button 
            onClick={() => {
                const currentInput = useGameStore.getState().input;
                if (viewMode === 'RTS') {
                  // Enter FPS Mode locks on first selected unit
                  const tar = selectedUnitsList[0];
                  if (tar) {
                    useGameStore.getState().setGameState({ 
                      input: { 
                        ...currentInput, 
                        viewMode: 'FPS', 
                        focusedEntityId: tar.id 
                      } 
                    });
                    useGameStore.getState().addNotification(`Direct focus link locked onto unit: ${tar.id.toUpperCase()}`, 'info');
                  } else {
                    useGameStore.getState().addNotification('Select a tactical unit first to bridge the FPS focus link.', 'warning');
                  }
                } else {
                  useGameStore.getState().setGameState({ 
                    input: { 
                      ...currentInput, 
                      viewMode: 'RTS', 
                      focusedEntityId: null 
                    } 
                  });
                  useGameStore.getState().addNotification('Restored high altitude RTS grid feed.', 'info');
                }
            }} 
            className={`group px-5 py-2.5 text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'FPS' 
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500/50 hover:bg-rose-600/45' 
                : 'bg-blue-600/30 text-blue-300 border border-blue-500/55 hover:bg-blue-600/45'
            }`}
          >
            {viewMode === 'RTS' ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            {viewMode === 'RTS' ? 'BRIDGE FPS LINK' : 'EXIT FPS GRID'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        {/* Main Scrolling Map Viewport */}
        <div 
          ref={mapWrapperRef}
          className="flex-1 relative overflow-auto custom-scrollbar bg-[#020204]"
        >
          <div 
            ref={containerRef} 
            className="relative w-[2000px] h-[2000px] cursor-crosshair overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
          />
          
          {/* Selection Box Render Overlay */}
          {selectionBox && (
            <div 
              className="absolute border border-emerald-500 bg-emerald-500/5 pointer-events-none"
              style={{
                left: Math.min(selectionBox.start.x, selectionBox.end.x),
                top: Math.min(selectionBox.start.y, selectionBox.end.y),
                width: Math.abs(selectionBox.start.x - selectionBox.end.x),
                height: Math.abs(selectionBox.start.y - selectionBox.end.y)
              }}
            >
              <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-emerald-400" />
              <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-emerald-400" />
              <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-emerald-400" />
              <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-emerald-400" />
            </div>
          )}
        </div>

        {/* Tactical Link Minimap Overlay overlaying raw map */}
        <Minimap />

        {/* Real-time Ticker Event Logs */}
        <div className="absolute bottom-6 left-6 w-80 space-y-2 pointer-events-none z-40">
          <AnimatePresence>
            {notifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`p-3 border-l-2 bg-black/80 backdrop-blur-md text-[10px] font-mono shadow-xl ${
                  n.type === 'danger' ? 'border-red-500 text-red-400' : 
                  n.type === 'warning' ? 'border-amber-500 text-amber-400' : 
                  'border-blue-500 text-blue-400'
                }`}
              >
                <div className="flex justify-between text-[8px] opacity-40 mb-1">
                   <span className="uppercase">{n.type} EVENT</span>
                   <span>{new Date(n.time).toLocaleTimeString([], { hour12: false })}</span>
                </div>
                <div className="text-white/95 font-bold tracking-wide">{n.message}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* FPS Control Guide overlay */}
        {viewMode === 'FPS' && focusedEntityId && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 p-4 bg-black/80 border border-rose-500/30 backdrop-blur-md z-40 rounded flex items-center gap-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <Crosshair className="text-rose-500 animate-spin" size={20} />
              <div className="flex flex-col">
                 <span className="text-[10px] font-mono text-rose-400 uppercase tracking-widest font-black">ACTIVE TELE-LINK ENGAGED</span>
                 <span className="text-[9px] text-white/50 font-mono">LOCKED ON UNIT: {focusedEntityId.toUpperCase()}</span>
              </div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex gap-4 text-[9px] font-mono">
               <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-white/10 rounded">W</kbd><kbd className="px-1.5 py-0.5 bg-white/10 rounded">A</kbd><kbd className="px-1.5 py-0.5 bg-white/10 rounded">S</kbd><kbd className="px-1.5 py-0.5 bg-white/10 rounded">D</kbd> Move</span>
               <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-white/10 rounded">Mouse-Down</kbd> Direct Fire Laser</span>
            </div>
          </div>
        )}

        {/* Side Control Desk Panel (Production & Assembly lines) */}
        <div className="w-80 bg-black/75 border-l border-white/10 p-6 space-y-8 z-40 overflow-y-auto custom-scrollbar shadow-[-10px_0_30px_rgba(0,0,0,0.5)] flex flex-col justify-start">
          
          {/* Unit Factory Manufacturing */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Unit Assembly Desk</h3>
                <Cpu size={14} className="text-white/20" />
            </div>
            
            <div className="grid grid-cols-1 gap-2">
                {(['Infantry', 'Armored', 'Air'] as ('Infantry' | 'Armored' | 'Air')[]).map(type => (
                <button 
                    key={type}
                    onClick={() => UnitProduction.addToQueue(type, selectedFaction, sessionTime)}
                    className="w-full relative flex justify-between items-center p-3.5 bg-white/[0.02] hover:bg-white/[0.07] border border-white/5 transition-all group overflow-hidden cursor-pointer"
                >
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 scale-y-0 group-hover:scale-y-100 transition-transform" />
                    <div className="flex flex-col items-start z-10">
                      <span className="text-[10px] font-black text-white/90 group-hover:text-blue-400 transition-colors uppercase tracking-widest">{type}</span>
                      <span className="text-[9px] font-mono text-white/40">${UNIT_STATS[type].cost} S-credits</span>
                    </div>
                    {type === 'Infantry' ? <Users size={16} className="text-white/15 group-hover:text-blue-500/45" /> : type === 'Armored' ? <Truck size={16} className="text-white/15 group-hover:text-blue-500/45" /> : <Plane size={16} className="text-white/15 group-hover:text-blue-500/45" />}
                </button>
                ))}
            </div>
          </div>

          {/* Active Construction Queue Updates */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">ASSEMBLY TIMELINE</h3>
                <Activity size={14} className="text-white/20" />
            </div>
            <div className="space-y-2.5">
              {productionQueue.length === 0 ? (
                <div className="text-[9px] text-white/20 italic font-mono p-3.5 border border-dashed border-white/10 text-center">Desk idle... Awaiting specifications</div>
              ) : (
                productionQueue.map(item => (
                  <div key={item.id} className="p-3 bg-blue-500/5 border border-blue-500/10">
                    <div className="flex justify-between text-[9px] mb-1.5 font-mono">
                      <span className="text-white/80 font-bold uppercase tracking-wider">{item.type}</span>
                      <span className="text-blue-400">{Math.floor(item.progress)}%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 shadow-[0_0_8px_rgba(0,102,255,0.7)] transition-all duration-300" 
                        style={{ width: `${item.progress}%` }} 
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Selection Dashboard Status Monitor */}
          <div className="space-y-4 flex-1 flex flex-col justify-end">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">GRID TELEMETRY</h3>
                <span className="text-[9px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/70">
                  {selectedUnitsList.length} Units Selection
                </span>
            </div>
            
            {selectedUnitsList.length > 0 ? (
              <div className="space-y-4">
                <div className="p-4 bg-white/5 border border-white/5 space-y-4">
                   <div className="space-y-1">
                      <div className="flex justify-between text-[8px] uppercase font-mono text-white/40">
                         <span>SQUAD HP INTEGRITY</span>
                         <span>
                           {Math.floor((selectedUnitsList.reduce((a, b) => a + b.health, 0) / selectedUnitsList.reduce((a, b) => a + b.maxHealth, 0)) * 100)}%
                         </span>
                      </div>
                      <div className="w-full h-1 bg-white/10 overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-300" 
                            style={{ 
                              width: `${(selectedUnitsList.reduce((a, b) => a + b.health, 0) / selectedUnitsList.reduce((a, b) => a + b.maxHealth, 0)) * 100}%` 
                            }} 
                          />
                      </div>
                   </div>

                   {selectedUnitsList.length === 1 && (
                     <div className="pt-3.5 border-t border-white/5 space-y-2">
                        <div className="flex justify-between text-[9px] font-mono">
                           <span className="text-white/30 uppercase">ID CODE</span>
                           <span className="text-white font-bold">{selectedUnitsList[0].id.toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between text-[9px] font-mono">
                           <span className="text-white/30 uppercase">CLASS SPECS</span>
                           <span className="text-white font-bold">{selectedUnitsList[0].class}</span>
                        </div>
                        <div className="flex justify-between text-[9px] font-mono">
                           <span className="text-white/30 uppercase">DAMAGE FACTOR</span>
                           <span className="text-blue-400 font-bold">{selectedUnitsList[0].damage} LW</span>
                        </div>
                        <div className="flex justify-between text-[9px] font-mono items-center">
                           <span className="text-white/30 uppercase">THERMALS</span>
                           <div className="w-20 h-1 bg-white/5 overflow-hidden">
                              <div className="h-full bg-rose-500" style={{ width: `${selectedUnitsList[0].heat * 100}%` }} />
                           </div>
                        </div>
                        <div className="flex justify-between text-[9px] font-mono pt-1">
                           <span className="text-white/30 uppercase">TACTICAL STATE</span>
                           <span className="text-emerald-400 font-bold uppercase tracking-[0.1em] animate-pulse">
                             {UnitState[selectedUnitsList[0].state]}
                           </span>
                        </div>
                        
                        {/* Selected Unit Commands list feed */}
                        {selectedUnitsList[0].commands.length > 0 && (
                           <div className="pt-2 space-y-1">
                              <div className="text-[8px] text-white/30 uppercase font-black tracking-widest">Active Commands</div>
                              {selectedUnitsList[0].commands.slice(0, 3).map((c, i) => (
                                 <div key={i} className="flex items-center gap-1 text-[8.5px] text-blue-400 font-mono font-bold">
                                    <ChevronRight size={10} className="text-blue-500" /> {c.type} {c.targetPos ? `(X: ${Math.floor(c.targetPos.x)}, Y: ${Math.floor(c.targetPos.y)})` : ''}
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                   )}
                </div>
                
                <button 
                  onClick={selfDestructSelected}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-950/20 hover:bg-red-900/35 border border-red-900/40 text-red-400 text-[9px] font-mono uppercase tracking-widest font-black transition-all cursor-pointer"
                >
                  <Flame size={12} className="text-red-500 animate-pulse" />
                  Decomission Selected
                </button>
              </div>
            ) : (
              <div className="text-[9px] text-white/20 italic font-mono p-4 border border-dashed border-white/10 text-center">
                No active targets selection... Lasso click-drag on map to read telemetry feeds
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
