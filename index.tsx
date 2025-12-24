import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPES & INTERFACES ---

type ThreatLevel = 'green' | 'amber' | 'hot';
type FactionType = 'Law Enforcement' | 'Criminal Syndicate' | 'Information Broker';

interface FactionRep {
  name: FactionType;
  score: number; // -100 to 100
  tier: string;
  description: string;
}

interface Anomaly {
  id: string;
  type: 'signal_anomaly' | 'device_ping' | 'osint_leak';
  description: string;
  severity: number;
  faction?: FactionType;
}

interface Agent {
  id: string;
  name: string;
  pos: { x: number; y: number };
  lastActive: number;
}

interface IntelEntry {
  id: string;
  timestamp: number;
  content: string;
  source: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'TOP SECRET';
}

interface WorldState {
  tick: number;
  threatLevel: ThreatLevel;
  activeMission: string | null;
  anomalies: Anomaly[];
  narratives: string[];
  factions: FactionRep[];
  intelEntries: IntelEntry[];
  agents: Agent[];
}

interface NotificationEvent {
  id: string;
  tier: 'INTEL' | 'ALERT' | 'CHIRP' | 'LOCKDOWN';
  message: string;
  timestamp: number;
  urgency: number;
}

// --- CONSTANTS ---

const STORAGE_KEY = 'unified_intel_v5_storage';
const SYNC_CHANNEL = 'unified_stack_multiplayer_sync';
const TICK_RATE = 2500;
const SESSION_AGENT_ID = 'AGENT-' + Math.random().toString(36).substr(2, 4);

// --- INITIAL STATE ---

const INITIAL_FACTIONS: FactionRep[] = [
  { name: 'Law Enforcement', score: 0, tier: 'Neutral', description: 'Monitoring urban safety and digital traffic.' },
  { name: 'Criminal Syndicate', score: 0, tier: 'Neutral', description: 'Underground data brokers and black-market ops.' },
  { name: 'Information Broker', score: 10, tier: 'Neutral', description: 'Neutrals selling access to the highest bidder.' },
];

const INITIAL_STATE: WorldState = {
  tick: 0,
  threatLevel: 'green',
  activeMission: null,
  anomalies: [],
  narratives: ["INITIALIZING STACK...", "KERNEL OK", "BITCHAT MESH ACTIVE"],
  factions: INITIAL_FACTIONS,
  intelEntries: [],
  agents: [{ id: SESSION_AGENT_ID, name: 'Local Operative', pos: { x: 50, y: 50 }, lastActive: Date.now() }],
};

// --- UTILS ---

const getRepTier = (score: number): string => {
  if (score > 60) return 'Exalted';
  if (score > 20) return 'Friendly';
  if (score < -60) return 'Hostile';
  if (score < -20) return 'Suspicious';
  return 'Neutral';
};

// --- COMPONENTS ---

const App: React.FC = () => {
  // 1. Persistent State Loading
  const [state, setState] = useState<WorldState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure the current agent is always in the state
        if (!parsed.agents.find((a: Agent) => a.id === SESSION_AGENT_ID)) {
          parsed.agents.push({ id: SESSION_AGENT_ID, name: 'Local Operative', pos: { x: 50, y: 50 }, lastActive: Date.now() });
        }
        return parsed;
      }
    } catch (e) {
      console.error("Failed to load state", e);
    }
    return INITIAL_STATE;
  });

  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [hackingActive, setHackingActive] = useState(false);
  const [hackingTarget, setHackingTarget] = useState<string | null>(null);
  const [hackSequence, setHackSequence] = useState<string[]>([]);
  const [playerSequence, setPlayerSequence] = useState<string[]>([]);
  const [isConsultingAi, setIsConsultingAi] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");

  const broadcastChannel = useRef<BroadcastChannel | null>(null);

  // --- PERSISTENCE & MULTIPLAYER SYNC ---

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    try {
      broadcastChannel.current = new BroadcastChannel(SYNC_CHANNEL);
      
      const handleSync = (event: MessageEvent) => {
        if (event.data.type === 'WORLD_STATE_UPDATE') {
          const incomingState = event.data.payload as WorldState;
          setState(prev => ({
            ...incomingState,
            agents: [
              ...incomingState.agents.filter(a => a.id !== SESSION_AGENT_ID),
              ...prev.agents.filter(a => a.id === SESSION_AGENT_ID)
            ]
          }));
        }
        if (event.data.type === 'ACTION_NOTIF') {
          const notif = event.data.payload as NotificationEvent;
          setNotifications(prev => [notif, ...prev].slice(0, 50));
        }
      };

      broadcastChannel.current.onmessage = handleSync;
    } catch (e) {
      console.warn("BroadcastChannel not available", e);
    }
    return () => broadcastChannel.current?.close();
  }, []);

  const emitNotification = (tier: NotificationEvent['tier'], message: string, urgency: number = 0) => {
    const notif: NotificationEvent = {
      id: Math.random().toString(36).substr(2, 9),
      tier,
      message,
      timestamp: Date.now(),
      urgency
    };
    setNotifications(prev => [notif, ...prev].slice(0, 50));
    broadcastChannel.current?.postMessage({ type: 'ACTION_NOTIF', payload: notif });
  };

  // --- OXCART SIMULATION TICK ---

  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        const newTick = prev.tick + 1;
        let newAnomalies = [...prev.anomalies];
        let newFactions = [...prev.factions];
        let newThreat = prev.threatLevel;

        // Random Event Generation
        if (Math.random() > 0.85) {
          const type = (['signal_anomaly', 'device_ping', 'osint_leak'] as const)[Math.floor(Math.random() * 3)];
          const f = (['Law Enforcement', 'Criminal Syndicate', 'Information Broker'] as const)[Math.floor(Math.random() * 3)];
          const anomaly: Anomaly = {
            id: `ANOM-${newTick}`,
            type,
            description: `${type.replace('_', ' ').toUpperCase()} detected near ${f} hub.`,
            severity: Math.floor(Math.random() * 4) + 2, // Moderate severity for minigame
            faction: f
          };
          newAnomalies.unshift(anomaly);
          emitNotification('ALERT', `Critical ${type.replace('_', ' ')} detected: ${anomaly.id}`, anomaly.severity / 10);
        }

        if (newAnomalies.length > 10) newAnomalies.pop();

        const narratives = [...prev.narratives];
        if (newTick % 10 === 0) narratives.unshift(`TICK ${newTick}: Routine network sweep completed.`);
        if (narratives.length > 20) narratives.pop();

        if (newTick % 15 === 0 && prev.threatLevel !== 'green') {
          newThreat = prev.threatLevel === 'hot' ? 'amber' : 'green';
        }

        const next = { ...prev, tick: newTick, anomalies: newAnomalies, narratives, factions: newFactions, threatLevel: newThreat };
        broadcastChannel.current?.postMessage({ type: 'WORLD_STATE_UPDATE', payload: next });
        return next;
      });
    }, TICK_RATE);
    return () => clearInterval(interval);
  }, []);

  // --- SINTEL: AI OSINT ANALYSIS ---

  const consultSintel = async () => {
    if (!selectedAnomaly) return;
    setIsConsultingAi(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are SINTEL, an advanced OSINT forensic AI. Analyze this anomaly: ${JSON.stringify(selectedAnomaly)}. 
        Provide a tactical summary, 3 recommended OSINT tools, and potential risks. 
        Formatting: Markdown, concise.`,
        config: { systemInstruction: "You are the primary intelligence advisor for a covert operative." }
      });
      setAiAnalysis(response.text || "Analysis inconclusive.");
      emitNotification('INTEL', `SINTEL: Analysis of ${selectedAnomaly.id} complete.`, 0.2);
    } catch (e) {
      setAiAnalysis("SINTEL offline: Check API connection.");
    } finally {
      setIsConsultingAi(false);
    }
  };

  // --- WATCH DOGS: HACKING MINIGAME ---

  const initiateHack = (target: Anomaly) => {
    setHackingTarget(target.id);
    const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
    const seq = Array.from({ length: target.severity }, () => colors[Math.floor(Math.random() * colors.length)]);
    setHackSequence(seq);
    setPlayerSequence([]);
    setHackingActive(true);
    emitNotification('CHIRP', `Breaching target: ${target.id}`, 0.5);
  };

  const handleHackInput = (color: string) => {
    const nextSeq = [...playerSequence, color];
    setPlayerSequence(nextSeq);

    if (hackSequence[playerSequence.length] !== color) {
      setHackingActive(false);
      emitNotification('LOCKDOWN', `BREACH FAILED at ${hackingTarget}. Traces detected.`, 1.0);
      setState(prev => ({
        ...prev,
        threatLevel: 'hot',
        factions: prev.factions.map(f => {
          const targetAnomaly = prev.anomalies.find(a => a.id === hackingTarget);
          if (f.name === targetAnomaly?.faction) return { ...f, score: Math.max(-100, f.score - 15), tier: getRepTier(f.score - 15) };
          return f;
        })
      }));
    } else if (nextSeq.length === hackSequence.length) {
      setHackingActive(false);
      emitNotification('CHIRP', `Breach SUCCESS: Accessing core of ${hackingTarget}.`, 0.1);
      
      const newIntel: IntelEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        content: `Acquired decrypted logs from ${hackingTarget}. Evidence of faction cross-talk found.`,
        source: 'Breach-V5',
        classification: 'CONFIDENTIAL'
      };

      setState(prev => ({
        ...prev,
        intelEntries: [newIntel, ...prev.intelEntries],
        factions: prev.factions.map(f => {
          const targetAnomaly = prev.anomalies.find(a => a.id === hackingTarget);
          if (f.name === targetAnomaly?.faction) return { ...f, score: Math.max(-100, f.score - 10), tier: getRepTier(f.score - 10) };
          return { ...f, score: Math.min(100, f.score + 5), tier: getRepTier(f.score + 5) };
        }),
        anomalies: prev.anomalies.filter(a => a.id !== hackingTarget)
      }));
      setSelectedAnomaly(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono p-4 flex flex-col gap-4 overflow-hidden selection:bg-[#003300] selection:text-[#00ff41]">
      {/* HEADER */}
      <div className="flex justify-between items-end border-b border-[#00ff41]/30 pb-2 shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic drop-shadow-[0_0_8px_rgba(0,255,65,0.4)]">Unified Intelligence Stack</h1>
          <div className="text-[10px] text-[#00ff41]/60 flex gap-4">
            <span>OPERATIVE: {SESSION_AGENT_ID}</span>
            <span>OS: FOXHOUND v5.0.1</span>
            <span>STORAGE: PERSISTENT_LOCAL_v1</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums leading-none">{state.tick.toString().padStart(6, '0')}</div>
          <div className="text-[10px] uppercase font-bold text-[#00ff41]/50">Global Sim Tick</div>
          <div className={`mt-1 text-[10px] px-2 py-0.5 inline-block border font-black uppercase ${state.threatLevel === 'hot' ? 'bg-red-900 border-red-500 text-red-200 animate-pulse' : state.threatLevel === 'amber' ? 'bg-yellow-900 border-yellow-500 text-yellow-200' : 'bg-green-900 border-green-500 text-green-200'}`}>
            Threat Level: {state.threatLevel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
        {/* LEFT COL: OXCART & FACTIONS */}
        <div className="col-span-12 md:col-span-3 flex flex-col gap-4 overflow-hidden">
          <Panel title="OXCART: LOGS">
            <div className="flex-1 overflow-y-auto space-y-1 text-[10px] scrollbar-hide">
              {state.narratives.map((n, i) => <div key={i} className="opacity-70">&gt; {n}</div>)}
            </div>
          </Panel>
          
          <Panel title="FACTION REPUTATION">
            <div className="space-y-4">
              {state.factions.map(f => (
                <div key={f.name} className="group cursor-help">
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span>{f.name}</span>
                    <span className={f.score >= 0 ? 'text-[#00ff41]' : 'text-red-500'}>{f.tier} ({f.score})</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#00ff41]/10 rounded-full overflow-hidden border border-[#00ff41]/20">
                    <div 
                      className={`h-full transition-all duration-1000 ${f.score >= 0 ? 'bg-[#00ff41]' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, (f.score + 100) / 2))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* MID COL: SINTEL & WATCH DOGS */}
        <div className="col-span-12 md:col-span-6 flex flex-col gap-4 overflow-hidden">
          <Panel title="SINTEL: INVESTIGATION QUEUE">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-full overflow-hidden">
              <div className="overflow-y-auto space-y-2 pr-2 scrollbar-hide">
                {state.anomalies.length === 0 && <div className="text-[10px] opacity-30 italic">Awaiting signal anomalies...</div>}
                {state.anomalies.map(a => (
                  <button 
                    key={a.id}
                    onClick={() => setSelectedAnomaly(a)}
                    className={`w-full text-left p-2 border transition-all ${selectedAnomaly?.id === a.id ? 'bg-[#00ff41] text-black border-[#00ff41]' : 'border-[#00ff41]/30 hover:border-[#00ff41] bg-[#00ff41]/5'}`}
                  >
                    <div className="flex justify-between font-black text-[10px]">
                      <span>{a.id}</span>
                      <span className="opacity-60">{a.severity}⚡</span>
                    </div>
                    <div className="text-[9px] truncate opacity-80 uppercase tracking-tighter">{a.description}</div>
                  </button>
                ))}
              </div>
              <div className="border-l border-[#00ff41]/20 pl-2 flex flex-col gap-2 overflow-hidden">
                {selectedAnomaly ? (
                  <>
                    <div className="text-[10px] border-b border-[#00ff41]/30 pb-1 mb-1 shrink-0">
                      <div className="font-black text-xs">SELECTED: {selectedAnomaly.id}</div>
                      <div className="opacity-70">ORIGIN: {selectedAnomaly.faction}</div>
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                      <button 
                        onClick={consultSintel}
                        disabled={isConsultingAi}
                        className="flex-1 text-[10px] bg-[#00ff41]/20 border border-[#00ff41] py-1 hover:bg-[#00ff41] hover:text-black font-bold uppercase disabled:opacity-50"
                      >
                        {isConsultingAi ? "ANALYZING..." : "SINTEL AI"}
                      </button>
                      <button 
                        onClick={() => initiateHack(selectedAnomaly)}
                        className="flex-1 text-[10px] bg-red-900/30 border border-red-500 text-red-400 py-1 hover:bg-red-500 hover:text-black font-bold uppercase"
                      >
                        BREACH
                      </button>
                    </div>

                    <div className="flex-1 text-[10px] bg-[#00ff41]/5 p-2 border border-[#00ff41]/20 overflow-y-auto leading-relaxed text-[#00ff41]/90 prose prose-invert prose-xs max-w-none">
                      {aiAnalysis || "Select SINTEL AI for technical analysis."}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-[10px] opacity-30 uppercase italic text-center">Select anomaly to begin</div>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="WATCH DOGS: HACKING MODULE">
            {hackingActive ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4">
                <div className="text-center">
                  <div className="text-[10px] uppercase font-bold opacity-60 mb-2">REPLICATE BREACH SEQUENCE</div>
                  <div className="flex gap-2 justify-center">
                    {hackSequence.map((_, i) => (
                      <div key={i} className={`w-3 h-3 rounded-full border border-[#00ff41] ${playerSequence.length > i ? 'bg-[#00ff41]' : 'bg-transparent shadow-[0_0_5px_#00ff41]'}`} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
                  {['RED', 'BLUE', 'GREEN', 'YELLOW'].map(c => (
                    <button 
                      key={c}
                      onClick={() => handleHackInput(c)}
                      className={`h-12 border-2 text-xs font-black transition-all active:scale-95 ${
                        c === 'RED' ? 'border-red-500 text-red-500 hover:bg-red-500 hover:text-black' :
                        c === 'BLUE' ? 'border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-black' :
                        c === 'GREEN' ? 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black' :
                        'border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full border border-[#00ff41]/10 rounded bg-[#00ff41]/5">
                <span className="text-[10px] opacity-40 uppercase tracking-widest animate-pulse">Waiting for breach initiation...</span>
              </div>
            )}
          </Panel>
        </div>

        {/* RIGHT COL: CHIRP & INTEL */}
        <div className="col-span-12 md:col-span-3 flex flex-col gap-4 overflow-hidden">
          <Panel title="CHIRP: EVENT BROKER">
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-hide">
              {notifications.map(n => (
                <div key={n.id} className={`p-2 border-l-2 text-[10px] relative overflow-hidden group ${
                  n.tier === 'LOCKDOWN' ? 'border-red-500 bg-red-500/10' :
                  n.tier === 'CHIRP' ? 'border-blue-500 bg-blue-500/10' :
                  n.tier === 'ALERT' ? 'border-yellow-500 bg-yellow-500/10' : 'border-[#00ff41]/40 bg-[#00ff41]/5'
                }`}>
                  <div className="flex justify-between opacity-50 text-[8px] mb-1">
                    <span className="font-bold">{n.tier}</span>
                    <span>{new Date(n.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="font-bold tracking-tight">{n.message}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="INTEL REPOSITORY">
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {state.intelEntries.length === 0 && <div className="text-[10px] opacity-30 italic text-center mt-10 uppercase">No intelligence archived.</div>}
              {state.intelEntries.map(e => (
                <div key={e.id} className="border border-[#00ff41]/20 p-2 bg-[#00ff41]/5 rounded shadow-[inset_0_0_10px_rgba(0,255,65,0.05)]">
                  <div className="flex justify-between text-[8px] mb-1">
                    <span className="font-black text-[#00ff41]/50">{e.classification}</span>
                    <span>{new Date(e.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="text-[10px] italic">"{e.content}"</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* FOOTER */}
      <div className="h-8 border-t border-[#00ff41]/30 flex items-center justify-between px-2 text-[10px] text-[#00ff41]/60 shrink-0">
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" /> MESH: ACTIVE</span>
          <span className="opacity-50">SYNC CHANNEL: {SYNC_CHANNEL}</span>
        </div>
        <div className="font-black italic">BITCHAT v2.2 // END_OF_LINE</div>
      </div>

      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] animate-scan" />
      <style>{`
        @keyframes scan {
          from { background-position: 0 0; }
          to { background-position: 0 100%; }
        }
        .animate-scan { animation: scan 20s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex-1 flex flex-col border border-[#00ff41]/30 bg-black/40 backdrop-blur-sm relative overflow-hidden group hover:border-[#00ff41]/60 transition-colors">
    <div className="bg-[#00ff41]/10 text-[#00ff41] text-[9px] font-black px-2 py-1 uppercase border-b border-[#00ff41]/30 flex justify-between items-center shrink-0">
      <span>{title}</span>
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-[#00ff41]/50" />
        <div className="w-1 h-1 bg-[#00ff41]/50" />
      </div>
    </div>
    <div className="flex-1 p-2 flex flex-col overflow-hidden relative">
      {children}
    </div>
    <div className="absolute bottom-0 right-0 w-4 h-4 overflow-hidden pointer-events-none">
       <div className="w-8 h-8 bg-[#00ff41]/20 rotate-45 translate-x-4 translate-y-4 border border-[#00ff41]/50" />
    </div>
  </div>
);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}