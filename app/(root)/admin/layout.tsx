import { requireStaffPage } from '@/lib/authz-server';

/**
 * The staff door. Every page under `/admin` is rendered only after this guard resolves a role with
 * at least one capability; a plain user is sent back to the overview. The guard is server-side, so
 * hiding the nav entry is a convenience, not the protection.
 */
const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
    await requireStaffPage();
    return <>{children}</>;
};

export default AdminLayout;
