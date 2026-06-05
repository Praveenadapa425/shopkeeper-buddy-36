import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProductForm } from "./products.new";
import { useEditUnlock } from "@/lib/editUnlock";

export const Route = createFileRoute("/_authenticated/products/$id/edit")({
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  const { isUnlocked, requireEdit } = useEditUnlock();
  const nav = useNavigate();
  const [allowed, setAllowed] = useState(() => isUnlocked());

  useEffect(() => {
    if (allowed) return;
    requireEdit(() => setAllowed(true));
    // If the user dismisses the dialog, bounce back to details.
    const t = setTimeout(() => {
      if (!isUnlocked()) nav({ to: "/products/$id", params: { id } });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) return null;
  return <ProductForm mode={{ kind: "edit", id }} />;
}
