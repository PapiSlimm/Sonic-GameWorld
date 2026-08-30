import { AppShell } from '../../components/shell/AppShell';
import { ForgeForm } from '../../components/forge/ForgeForm';

export default function ForgePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-6">
        <ForgeForm />
      </div>
    </AppShell>
  );
}
