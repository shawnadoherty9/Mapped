import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Floating "Go to Landing" shortcut shown on every /app/* screen.
 * Fixed to the top-right so it stays reachable without editing each page.
 */
const GoToLandingButton = () => {
  const { pathname } = useLocation();
  if (!pathname.startsWith("/app")) return null;

  return (
    <div className="fixed top-3 right-3 z-50">
      <Button
        asChild
        size="sm"
        variant="secondary"
        className="shadow-lg border border-border/60 backdrop-blur bg-background/90 hover:bg-background"
      >
        <Link to="/" aria-label="Go to landing page">
          <Home className="h-4 w-4 mr-1.5" />
          Go to Landing
        </Link>
      </Button>
    </div>
  );
};

export default GoToLandingButton;
