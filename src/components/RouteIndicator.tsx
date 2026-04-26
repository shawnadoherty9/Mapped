import { useLocation } from "react-router-dom";

/**
 * Tiny fixed badge showing the current route path.
 * Helps confirm whether you're on the landing (/) or inside the app (/app/...).
 */
const RouteIndicator = () => {
  const { pathname } = useLocation();

  return (
    <div className="fixed bottom-3 left-3 z-50 pointer-events-none">
      <div className="px-2 py-1 rounded-md text-[11px] font-mono shadow-md border border-border/60 bg-background/85 backdrop-blur text-muted-foreground">
        <span className="text-foreground/60 mr-1">route:</span>
        <span className="text-foreground">{pathname}</span>
      </div>
    </div>
  );
};

export default RouteIndicator;
