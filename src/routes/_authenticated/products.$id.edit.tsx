import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "./products.new";

export const Route = createFileRoute("/_authenticated/products/$id/edit")({
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  return <ProductForm mode={{ kind: "edit", id }} />;
}
