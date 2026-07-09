import "./globals.css";

export const metadata = {
  title: "WorkNote AI",
  description: "Next.js + Supabase + OpenAI 기반 업무 문서 검색 데모",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
