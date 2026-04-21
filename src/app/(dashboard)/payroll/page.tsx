import { redirect } from "next/navigation";

export default function PayrollRedirect() {
  redirect("/dispatchers?tab=payroll");
}
