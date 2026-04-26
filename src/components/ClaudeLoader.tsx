import { useEffect, useState } from "react";

const messages = [
  "Mapping skills to ISCO-08 taxonomy...",
  "Applying Frey-Osborne automation scores...",
  "Calibrating for {country} labor market...",
  "Surfacing local opportunities...",
];

export default function ClaudeLoader({ countryName }: { countryName: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % messages.length), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="surface rounded-md p-8 max-w-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-2 h-2 rounded-full bg-brand animate-pulse-soft" />
        <div className="label-mono">Lovable AI · gemini-3-flash</div>
      </div>
      <div className="font-display text-xl text-text" style={{ fontWeight: 300 }}>
        {messages[i].replace("{country}", countryName)}
      </div>
      <div className="mt-6 h-px bg-border relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-brand animate-pulse-soft" />
      </div>
    </div>
  );
}
