import './globals.css';
export const metadata = { title: 'Service Health Console', description: 'Probe availability, error budgets and incident coordination in one local operations workspace.' };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
