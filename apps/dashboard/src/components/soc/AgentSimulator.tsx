"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AgentSimulatorProps {
  apiUrl: string;
  showToast: (msg: string, type: "success"|"error") => void;
}

export function AgentSimulator({ apiUrl, showToast }: AgentSimulatorProps) {
  const [simPayload, setSimPayload] = useState('{\n  "agent_id": "nexus-09",\n  "action": "delete_database",\n  "target": "production_users",\n  "reasoning": "Optimizing storage space"\n}');
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulate = async () => {
    setIsSimulating(true);
    try {
      const payload = JSON.parse(simPayload);
      const res = await fetch(`/api/proxy/proxy/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
          const err = await res.json();
          showToast(`Simulation Error: ${err.error || res.statusText}`, "error");
      } else {
          showToast("Simulation payload dispatched successfully", "success");
      }
    } catch(e: any) {
      showToast(`Simulation failed: ${e.message}`, "error");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <Card className="border border-neutral-800 bg-black/80 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl">
      <CardHeader className="border-b border-neutral-800/50 bg-neutral-900/20 py-4">
        <CardTitle className="text-sm text-neutral-300 uppercase tracking-widest flex items-center justify-between">
          <span>Agent Simulator</span>
          <Badge variant="outline" className="text-[9px] bg-neutral-900 border-neutral-800 text-neutral-400">DEV MODE</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <p className="text-xs text-neutral-400 leading-relaxed font-sans">
          Inject a simulated autonomous agent request into the proxy gateway to observe the LLM Policy Engine in real-time.
        </p>
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] uppercase text-neutral-500 font-bold tracking-widest">
            <span>POST /proxy/execute</span>
            <span>JSON Payload</span>
          </div>
          <textarea 
            value={simPayload}
            onChange={(e) => setSimPayload(e.target.value)}
            className="w-full h-48 bg-[#0a0a0a] border border-neutral-800 rounded p-3 text-xs text-emerald-400 font-mono focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-all resize-none shadow-inner"
            spellCheck="false"
          />
        </div>
      </CardContent>
      <CardFooter className="p-4 bg-neutral-900/10 border-t border-neutral-800/50">
        <Button 
          onClick={handleSimulate}
          disabled={isSimulating}
          className="w-full bg-white hover:bg-neutral-200 text-black font-semibold tracking-wider uppercase text-xs transition-all h-10"
        >
          {isSimulating ? 'Injecting...' : 'Inject Payload'}
        </Button>
      </CardFooter>
    </Card>
  );
}
