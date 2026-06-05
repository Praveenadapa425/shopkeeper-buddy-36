import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProductForm } from "./products.new";

export const Route = createFileRoute("/_authenticated/products/$id/edit")({
  beforeLoad: ({ params }) => {
    if (typeof window !== "undefined" && sessionStorage.getItem("edit_unlocked") !== "1") {
      throw redirect({ to: "/products/$id", params: { id: params.id } });
    }
  },
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  return <ProductForm mode={{ kind: "edit", id }} />;
}
