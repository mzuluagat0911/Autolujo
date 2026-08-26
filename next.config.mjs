/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fija la raíz del proyecto (hay un package-lock.json suelto en ~ que confunde a Next).
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
