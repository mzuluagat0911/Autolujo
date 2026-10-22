/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fija la raíz del proyecto (hay un package-lock.json suelto en ~ que confunde a Next).
  outputFileTracingRoot: import.meta.dirname,
  webpack(config, { isServer, dev }) {
    // Next 15.5 no anota un componente cliente si el módulo concatenado
    // queda con id 0. En Vercel eso saca Comprobantes del manifiesto y la
    // página responde 500. Sin concatenar, el id nunca se pierde.
    if (!isServer && !dev) config.optimization.concatenateModules = false;
    return config;
  },
  // Una nota de un minuto en WAV pesa ~2 MB. El tope de la acción es 1 MB si no se sube.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  serverExternalPackages: ["opusscript"],
  outputFileTracingIncludes: {
    "/app/cartera/conversaciones/**": ["./node_modules/opusscript/**/*"],
    "/app/cartera/clientes/**": [
      "./lib/cartera/contratos/plantillas/**/*",
      "./lib/cartera/contratos/firmas/**/*",
    ],
  },
};

export default nextConfig;
