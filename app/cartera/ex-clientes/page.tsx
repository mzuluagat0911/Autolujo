import { listarEmpresasEx, listarExClientes } from "@/lib/cartera/ex-clientes";
import { ListaExClientes } from "./lista";

export const dynamic = "force-dynamic";

export default async function ExClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const [{ filas, error }, empresas] = await Promise.all([listarExClientes(), listarEmpresasEx()]);
  return <ListaExClientes filas={filas} empresas={empresas} error={error} aviso={aviso} />;
}
