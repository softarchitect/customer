import "./globals.css";

export const metadata = {
  title: "User Contact Directory",
  description: "Searchable customer contact directory with delivery flags and notes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
