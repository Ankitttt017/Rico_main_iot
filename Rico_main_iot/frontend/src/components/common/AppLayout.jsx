import React from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import { useSidebar } from "../../context/SidebarContext";

const AppLayout = ({ onLogout, currentUser, children, hideFooter = false }) => {
  const { collapsed } = useSidebar();

  return (
    <div className="flex min-h-screen flex-col bg-[#eef4fb] app-page">
      <Navbar onLogout={onLogout} currentUser={currentUser} />
      <Sidebar />
      <main
        className={`flex min-h-screen flex-col pt-[94px] transition-all duration-300 ease-in-out ${
          collapsed ? "lg:pl-[72px]" : "lg:pl-72"
        }`}
      >
        <div className="flex-1 p-4 sm:p-6">{children}</div>
        {!hideFooter && (
          <footer className="border-t border-[#cfdded]/80 bg-white/75 px-4 py-3 text-center text-xs font-medium text-slate-500 backdrop-blur sm:px-6">
            Rico Auto Industries Limited - IoT Master Data
          </footer>
        )}
      </main>
    </div>
  );
};

export default AppLayout;
