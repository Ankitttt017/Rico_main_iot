import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../../components/common/Navbar";
import Sidebar from "../../../components/common/Sidebar";
import { getMachines } from "../../../services/api";
import { useSidebar } from "../../../context/SidebarContext";

// ── helpers ──────────────────────────────────────────────────────────────────
import {
  ConfigTab,
  DowntimeTab,
  EditModal,
  InfoRow,
  LiveStatusTab,
  MachineImagePanel,
  MaintenanceTab,
  OperationSetupTab,
  StatsTab,
  TABS,
  getDivision,
  getLine,
  getMachineType,
  getShop,
  safe,
} from "../components/profile/MachineProfileSections";
const MachineProfilePage = ({ onLogout, currentUser }) => {
  const { collapsed } = useSidebar();
  const { id } = useParams();
  const navigate = useNavigate();
  const [machine, setMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("live");
  const [editModal, setEditModal] = useState(null); // { field, value }

  // Local overrides for editable fields
  const [fieldOverrides, setFieldOverrides] = useState({});

  useEffect(() => {
    getMachines()
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        const found = list.find(m => String(m.id) === String(id));
        setMachine(found || null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleEdit = (field, currentValue) => {
    setEditModal({ field, value: fieldOverrides[field] ?? currentValue });
  };

  const handleSave = (field, newValue) => {
    setFieldOverrides(prev => ({ ...prev, [field]: newValue }));
  };

  const getVal = (field, fallback) => fieldOverrides[field] ?? fallback;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center">
        <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center flex-col gap-3">
        <p className="text-gray-500 font-medium">Machine not found.</p>
        <button onClick={() => navigate("/machines")} className="text-blue-600 text-sm font-semibold hover:underline">
          ← Back to Machine Master
        </button>
      </div>
    );
  }

  const division = getDivision(machine.name);
  const line     = getLine(machine.name);
  const type     = getMachineType(machine.name);
  const shop     = getShop(machine.name);

  const renderTab = () => {
    if (activeTab === "live")   return <LiveStatusTab machine={machine} />;
    if (activeTab === "operation") return <OperationSetupTab machine={machine} />;
    if (activeTab === "config") return <ConfigTab machine={machine} />;
    if (activeTab === "stats")  return <StatsTab />;
    if (activeTab === "down")   return <DowntimeTab machine={machine} />;
    if (activeTab === "maint")  return <MaintenanceTab />;
  };

  return (
    <div className="min-h-screen app-page">
      <Navbar onLogout={onLogout} currentUser={currentUser} />
      <Sidebar />

      {/* Edit Modal */}
      {editModal && (
        <EditModal
          field={editModal.field}
          value={editModal.value}
          onSave={handleSave}
          onClose={() => setEditModal(null)}
        />
      )}

      <main className={`pt-[94px] transition-all duration-300 ease-in-out ${
        collapsed ? "lg:pl-[72px]" : "lg:pl-72"
      }`}>
        <div className="p-4 sm:p-6">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-5 text-sm">
            <button onClick={() => navigate("/machines")} className="text-blue-600 font-semibold hover:underline">
              Organisation Master
            </button>
            <span className="text-gray-300">›</span>
            <button onClick={() => navigate("/machines")} className="text-blue-600 font-semibold hover:underline">
              Machines
            </button>
            <span className="text-gray-300">›</span>
            <span className="text-gray-600 font-medium">Machine Profile</span>
          </div>

          <div className="flex flex-col lg:flex-row gap-5">

            {/* ── Left Panel ── */}
            <div className="w-full lg:w-72 flex-shrink-0">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Machine image panel with upload */}
                <MachineImagePanel machineName={safe(machine.name)} status={machine?.status} />

                <div className="p-4">
                  <h2 className="text-sm font-extrabold text-gray-900 text-center mb-1 leading-tight">
                    {getVal("Machine Name", safe(machine.name))}
                  </h2>
                  <p className="text-[11px] text-gray-400 text-center mb-4 font-medium">Machine Profile</p>

                  <InfoRow label="Division"        value={getVal("Division", division)}                          highlight onEdit={handleEdit} />
                  <InfoRow label="Line"            value={getVal("Line", line)}                                  highlight onEdit={handleEdit} />
                  <InfoRow label="Type"            value={getVal("Type", type)}                                            onEdit={handleEdit} />
                  <InfoRow label="Shop"            value={getVal("Shop", shop)}                                            onEdit={handleEdit} />
                  <InfoRow label="Manufacturer"    value={getVal("Manufacturer", "—")}                                     onEdit={handleEdit} />
                  <InfoRow label="Controller"      value={getVal("Controller", "—")}                                       onEdit={handleEdit} />
                  <InfoRow label="Serial Number"   value={getVal("Serial Number", "—")}                                    onEdit={handleEdit} />
                  <InfoRow label="Warranty Expiry" value={getVal("Warranty Expiry", "Not Found")}                          onEdit={handleEdit} />
                  <InfoRow label="Registered On"   value={getVal("Registered On", "—")}                                    onEdit={handleEdit} />
                  <InfoRow label="Registered By"   value={getVal("Registered By", "Rico Auto Industries")}                 onEdit={handleEdit} />
                </div>
              </div>
            </div>

            {/* ── Right Panel ── */}
            <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50/50">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex-shrink-0 uppercase tracking-wide ${
                      activeTab === tab.id
                        ? "border-blue-600 text-blue-600 bg-white"
                        : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-white"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-5">
                {renderTab()}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default MachineProfilePage;

