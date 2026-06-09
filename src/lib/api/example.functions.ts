import { z } from "zod";

// Example client function:
export async function getGreeting({ data }: { data: { name: string } }) {
  z.object({ name: z.string().min(1) }).parse(data);
  return {
    greeting: `Hello, ${data.name}!`,
    mode: "client",
  };
}
