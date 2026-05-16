import { Compass, ArrowLeft, Search, Library, FlaskConical } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const version = "v0.1.0";

  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-[540px] border-border">
        <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
          <div
            aria-hidden="true"
            className="relative flex h-28 w-28 items-center justify-center"
          >
            <span className="absolute inset-0 flex select-none items-center justify-center text-7xl font-bold tracking-tighter text-muted-foreground/15">
              404
            </span>
            <Compass
              className="relative h-14 w-14 text-muted-foreground"
              strokeWidth={1.25}
            />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              This route is uncharted.
            </h1>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find a page at{" "}
              <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-foreground">
                {location.pathname}
              </code>
              . Pick a heading below to get back on course.
            </p>
          </div>

          <nav
            aria-label="Where to next"
            className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center"
          >
            <Button asChild variant="default" size="md">
              <Link to="/">
                <Search className="h-4 w-4" />
                Go to Search
              </Link>
            </Button>
            <Button asChild variant="secondary" size="md">
              <Link to="/library">
                <Library className="h-4 w-4" />
                Open Library
              </Link>
            </Button>
            <Button asChild variant="secondary" size="md">
              <Link to="/experiments">
                <FlaskConical className="h-4 w-4" />
                Recent Experiments
              </Link>
            </Button>
          </nav>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </Button>

          <p className="pt-2 text-xs text-muted-foreground/70">
            Platform {version} &middot;{" "}
            <Link
              to="/docs/operations.md"
              className="underline-offset-4 hover:text-muted-foreground hover:underline"
            >
              docs/operations.md
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
