import {requireContext} from "@/lib/auth";
import { canRead } from "@/lib/module-access";import {ReconciliationPrototype} from "@/components/spm/WorkflowPrototype";export default async function Page(){const c=await requireContext();if(!c.featureAccess["spm.reconciliation"])return <p>Akses submenu Rekonsiliasi SPM dibatasi untuk akun Anda.</p>;return <ReconciliationPrototype/>}
