import { notFound, redirect } from "next/navigation";
import { StudentProfile } from "@/components/students/student-profile";
import { getActiveSessionUser } from "@/lib/auth/server-session";
import { getStudentProfileOverview, StudentProfileNotFoundError } from "@/lib/services/student-profile";

export default async function StudentProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const session = await getActiveSessionUser();
  if (!session) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const rawReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const returnTo = rawReturnTo?.startsWith("/alunos") ? rawReturnTo : "/alunos";
  try {
    const overview = await getStudentProfileOverview(id, session.role);
    return <StudentProfile initialOverview={overview} returnTo={returnTo} />;
  } catch (error) {
    if (error instanceof StudentProfileNotFoundError) notFound();
    throw error;
  }
}
