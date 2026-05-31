"use client";

import { usePathname } from "next/navigation";
import { Web3Provider } from "./Web3Provider";
import { ChainGuard }   from "../components/shared/ChainGuard";
import { Navbar }       from "../components/shared/Navbar";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <Web3Provider>
      {isLanding ? (
        /* Landing page — no Navbar, no ChainGuard, no wallet required */
        <>{children}</>
      ) : (
        /* App pages — full Navbar + ChainGuard */
        <ChainGuard>
          <div className="page-content">
            <Navbar />
            <main>{children}</main>
          </div>
        </ChainGuard>
      )}
    </Web3Provider>
  );
}
