"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/app/auth-provider";
import { resolvePostLoginPath } from "@/lib/access";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (loading) return;

    let mounted = true;

    async function redirect() {
      const path = user ? await resolvePostLoginPath(user) : "/login";
      if (mounted) router.replace(path);
    }

    redirect();

    return () => {
      mounted = false;
    };
  }, [loading, router, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-12 w-44" />
        <Skeleton className="h-32 w-full" />
      </div>
    </main>
  );
}
