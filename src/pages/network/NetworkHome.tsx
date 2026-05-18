/**
 * Network home — landing page for the v1.0/v1.1 on-chain observability
 * surfaces. Currently a thin grid of "subsection" cards linking to the
 * one subpage that exists (Audit Outcomes). Subsequent PRs will fill
 * the empty card slots (Credit Lines / Reputations / Pools / Stakes /
 * Jobs / Pending Finalizations / Health).
 *
 * Read-only. No wallet connection. Polls daemon JSON endpoints through
 * the vite proxy in vite.config.ts.
 */
import { Link } from "react-router-dom";
import {
  Activity,
  Coins,
  Gavel,
  Heart,
  HelpCircle,
  Layers,
  ScrollText,
  Sigma,
  Wallet,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SubsectionCard = {
  to: string;
  label: string;
  blurb: string;
  icon: typeof Activity;
  // status="live" → card is clickable & rendered as a route link
  // status="planned" → card is dimmed & non-interactive
  status: "live" | "planned";
};

const SUBSECTIONS: readonly SubsectionCard[] = [
  {
    to: "/network/outcomes",
    label: "Audit outcomes",
    blurb:
      "Recent audits posted to the Audit contract — pass/fail, similarity, challenge status, finalisation.",
    icon: Gavel,
    status: "live",
  },
  {
    to: "/network/credit-lines",
    label: "Credit lines",
    blurb:
      "Per-creditor credit extended / repaid; outstanding exposure between any creditor↔debtor pair.",
    icon: Coins,
    status: "planned",
  },
  {
    to: "/network/reputations",
    label: "Reputations",
    blurb:
      "Per-node reputation: earned score, defaults, donations, identity-burn status.",
    icon: Sigma,
    status: "planned",
  },
  {
    to: "/network/pools",
    label: "Pools",
    blurb: "Federation pool registry — operator, tax bps, current members.",
    icon: Layers,
    status: "planned",
  },
  {
    to: "/network/stakes",
    label: "Stakes",
    blurb:
      "Per-node deposit/withdraw history from the Ledger contract — running available + locked totals.",
    icon: Wallet,
    status: "planned",
  },
  {
    to: "/network/jobs",
    label: "Jobs",
    blurb:
      "On-chain job lifecycle (lock → settle / slash). Cross-references audit outcomes by jobId.",
    icon: ScrollText,
    status: "planned",
  },
  {
    to: "/network/pending-finalizations",
    label: "Pending finalisations",
    blurb:
      "Outcomes the finalize-bot is tracking, awaiting their 24h dispute window.",
    icon: HelpCircle,
    status: "planned",
  },
  {
    to: "/network/health",
    label: "Daemon health",
    blurb:
      "Aggregated /health from audit-monitor, ledger-monitor, federation-monitor, finalize-bot.",
    icon: Heart,
    status: "planned",
  },
];

export default function NetworkHome() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">
            v1.0 Network
          </h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Read-only public dashboard for the Adamaton v1.0 contracts and the
          monitor daemons indexing them. No wallet connection required.
          Source data: the four monitor daemons (<code>audit-monitor</code>,{" "}
          <code>ledger-monitor</code>, <code>federation-monitor</code>,{" "}
          <code>finalize-bot</code>) on their default loopback ports.
        </p>
      </header>

      <section
        aria-label="Network subsections"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SUBSECTIONS.map((s) => {
          const Icon = s.icon;
          const cardInner = (
            <Card
              className={cn(
                "h-full transition-colors",
                s.status === "live"
                  ? "hover:border-primary/60 hover:bg-accent/40"
                  : "opacity-60",
              )}
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border",
                    s.status === "live"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-muted-foreground/20 bg-muted/40 text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base font-semibold">
                    {s.label}
                  </CardTitle>
                  {s.status === "planned" ? (
                    <span className="inline-flex w-fit items-center rounded-full border border-border bg-muted/40 px-1.5 py-0 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                      Planned
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.blurb}</p>
              </CardContent>
            </Card>
          );

          if (s.status === "live") {
            return (
              <Link
                key={s.to}
                to={s.to}
                className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {cardInner}
              </Link>
            );
          }
          return (
            <div
              key={s.to}
              aria-disabled="true"
              title="Subpage planned — see RUNBOOK-* for the underlying daemon"
            >
              {cardInner}
            </div>
          );
        })}
      </section>
    </div>
  );
}
