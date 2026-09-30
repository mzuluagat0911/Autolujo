/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fija la raíz del proyecto (hay un package-lock.json suelto en ~ que confunde a Next).
  outputFileTracingRoot: import.meta.dirname,
  // Una nota de un minuto en WAV pesa ~2 MB. El tope de la acción es 1 MB si no se sube.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  serverExternalPackages: ["opusscript"],
  outputFileTracingIncludes: {
    "/app/cartera/conversaciones/**": ["./node_modules/opusscript/**/*"],
  },
};

export default nextConfig;
