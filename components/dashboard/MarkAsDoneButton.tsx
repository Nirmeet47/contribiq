"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiJson, ApiClientError } from "@/lib/api-client";

export function MarkAsDoneButton({ issueId }: { issueId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const completeMutation = useMutation({
    mutationFn: async () =>
      apiJson(`/api/issues/${issueId}/complete`, {
        body: { prUrl },
        fallbackMessage: "Failed to record contribution",
      }),
    onSuccess: () => {
      setOpen(false);
      setPrUrl("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["working"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
      setToast("Contribution recorded!");
      globalThis.setTimeout(() => setToast(null), 4000);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : "Failed to record contribution"
      );
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        Mark as done
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-sm border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-100">Mark issue as done</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Paste the URL of your merged pull request. We&apos;ll verify it against GitHub
              before recording it as a contribution.
            </p>

            <Input
              autoFocus
              value={prUrl}
              onChange={(event) => setPrUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="mt-4"
              disabled={completeMutation.isPending}
            />

            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={completeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setError(null);
                  completeMutation.mutate();
                }}
                disabled={completeMutation.isPending || !prUrl.trim()}
              >
                {completeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Verify & complete"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl">
          {toast}
        </div>
      )}
    </>
  );
}
