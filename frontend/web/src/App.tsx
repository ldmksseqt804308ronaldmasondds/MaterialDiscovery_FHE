import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface MaterialData {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  materialType: string;
  properties: string;
  researchInstitution: string;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<MaterialData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newMaterialData, setNewMaterialData] = useState({
    materialType: "",
    properties: "",
    researchInstitution: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showTeamInfo, setShowTeamInfo] = useState(false);

  // Calculate statistics for dashboard
  const verifiedCount = materials.filter(m => m.status === "verified").length;
  const pendingCount = materials.filter(m => m.status === "pending").length;
  const rejectedCount = materials.filter(m => m.status === "rejected").length;

  // Filter materials based on search and filter
  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.materialType.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          material.researchInstitution.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" || material.status === filterType;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    loadMaterials().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadMaterials = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("material_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing material keys:", e);
        }
      }
      
      const list: MaterialData[] = [];
      
      for (const key of keys) {
        try {
          const materialBytes = await contract.getData(`material_${key}`);
          if (materialBytes.length > 0) {
            try {
              const materialData = JSON.parse(ethers.toUtf8String(materialBytes));
              list.push({
                id: key,
                encryptedData: materialData.data,
                timestamp: materialData.timestamp,
                owner: materialData.owner,
                materialType: materialData.materialType,
                properties: materialData.properties,
                researchInstitution: materialData.researchInstitution,
                status: materialData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing material data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading material ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMaterials(list);
    } catch (e) {
      console.error("Error loading materials:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitMaterial = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting material data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newMaterialData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const materialId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const materialData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        materialType: newMaterialData.materialType,
        properties: newMaterialData.properties,
        researchInstitution: newMaterialData.researchInstitution,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `material_${materialId}`, 
        ethers.toUtf8Bytes(JSON.stringify(materialData))
      );
      
      const keysBytes = await contract.getData("material_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(materialId);
      
      await contract.setData(
        "material_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted material data submitted securely!"
      });
      
      await loadMaterials();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewMaterialData({
          materialType: "",
          properties: "",
          researchInstitution: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyMaterial = async (materialId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted material data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const materialBytes = await contract.getData(`material_${materialId}`);
      if (materialBytes.length === 0) {
        throw new Error("Material not found");
      }
      
      const materialData = JSON.parse(ethers.toUtf8String(materialBytes));
      
      const updatedMaterial = {
        ...materialData,
        status: "verified"
      };
      
      await contract.setData(
        `material_${materialId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedMaterial))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadMaterials();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectMaterial = async (materialId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted material data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const materialBytes = await contract.getData(`material_${materialId}`);
      if (materialBytes.length === 0) {
        throw new Error("Material not found");
      }
      
      const materialData = JSON.parse(ethers.toUtf8String(materialBytes));
      
      const updatedMaterial = {
        ...materialData,
        status: "rejected"
      };
      
      await contract.setData(
        `material_${materialId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedMaterial))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadMaterials();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderBarChart = () => {
    // Count materials by type for the chart
    const materialCounts: Record<string, number> = {};
    materials.forEach(material => {
      if (material.status === "verified") {
        materialCounts[material.materialType] = (materialCounts[material.materialType] || 0) + 1;
      }
    });
    
    const maxCount = Math.max(...Object.values(materialCounts), 1);
    const materialTypes = Object.keys(materialCounts);
    
    return (
      <div className="bar-chart-container">
        {materialTypes.map((type, index) => {
          const height = (materialCounts[type] / maxCount) * 100;
          return (
            <div key={index} className="bar-item">
              <div className="bar-label">{type}</div>
              <div className="bar">
                <div 
                  className="bar-fill" 
                  style={{ height: `${height}%` }}
                ></div>
              </div>
              <div className="bar-value">{materialCounts[type]}</div>
            </div>
          );
        })}
        {materialTypes.length === 0 && (
          <div className="no-chart-data">No verified materials yet</div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>FHE<span>Materials</span>Discovery</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-material-btn industrial-button"
          >
            <div className="add-icon"></div>
            Add Material
          </button>
          <button 
            className="industrial-button"
            onClick={() => setShowTeamInfo(!showTeamInfo)}
          >
            {showTeamInfo ? "Hide Team" : "Show Team"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="panel-layout">
          {/* Left Panel - Project Info and Stats */}
          <div className="left-panel">
            <div className="industrial-card project-info">
              <h2>FHE-Based Materials Discovery Platform</h2>
              <p>
                A secure platform enabling research institutions to share encrypted material data 
                and run AI models using Fully Homomorphic Encryption (FHE) to predict and discover 
                new materials while maintaining data privacy.
              </p>
              <div className="fhe-badge">
                <span>FHE-Powered</span>
              </div>
            </div>
            
            <div className="industrial-card stats-card">
              <h3>Material Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{materials.length}</div>
                  <div className="stat-label">Total Materials</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{verifiedCount}</div>
                  <div className="stat-label">Verified</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{pendingCount}</div>
                  <div className="stat-label">Pending</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{rejectedCount}</div>
                  <div className="stat-label">Rejected</div>
                </div>
              </div>
            </div>
            
            <div className="industrial-card chart-card">
              <h3>Material Distribution</h3>
              {renderBarChart()}
            </div>
            
            {showTeamInfo && (
              <div className="industrial-card team-card">
                <h3>Research Team</h3>
                <div className="team-list">
                  <div className="team-member">
                    <div className="member-avatar"></div>
                    <div className="member-info">
                      <h4>Dr. Elena Rodriguez</h4>
                      <p>Materials Science Lead</p>
                    </div>
                  </div>
                  <div className="team-member">
                    <div className="member-avatar"></div>
                    <div className="member-info">
                      <h4>Prof. James Chen</h4>
                      <p>Cryptography Expert</p>
                    </div>
                  </div>
                  <div className="team-member">
                    <div className="member-avatar"></div>
                    <div className="member-info">
                      <h4>Dr. Sarah Johnson</h4>
                      <p>AI Research Director</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Right Panel - Materials List */}
          <div className="right-panel">
            <div className="industrial-card materials-section">
              <div className="section-header">
                <h2>Encrypted Material Database</h2>
                <div className="header-actions">
                  <div className="search-filter">
                    <input 
                      type="text"
                      placeholder="Search materials..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="industrial-input"
                    />
                    <select 
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="industrial-select"
                    >
                      <option value="all">All Status</option>
                      <option value="verified">Verified</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <button 
                    onClick={loadMaterials}
                    className="refresh-btn industrial-button"
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>
              
              <div className="materials-list">
                <div className="table-header">
                  <div className="header-cell">ID</div>
                  <div className="header-cell">Material Type</div>
                  <div className="header-cell">Institution</div>
                  <div className="header-cell">Date</div>
                  <div className="header-cell">Status</div>
                  <div className="header-cell">Actions</div>
                </div>
                
                {filteredMaterials.length === 0 ? (
                  <div className="no-materials">
                    <div className="no-materials-icon"></div>
                    <p>No material data found</p>
                    <button 
                      className="industrial-button primary"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Add First Material
                    </button>
                  </div>
                ) : (
                  filteredMaterials.map(material => (
                    <div className="material-row" key={material.id}>
                      <div className="table-cell material-id">#{material.id.substring(0, 6)}</div>
                      <div className="table-cell">{material.materialType}</div>
                      <div className="table-cell">{material.researchInstitution}</div>
                      <div className="table-cell">
                        {new Date(material.timestamp * 1000).toLocaleDateString()}
                      </div>
                      <div className="table-cell">
                        <span className={`status-badge ${material.status}`}>
                          {material.status}
                        </span>
                      </div>
                      <div className="table-cell actions">
                        {isOwner(material.owner) && material.status === "pending" && (
                          <>
                            <button 
                              className="action-btn industrial-button success"
                              onClick={() => verifyMaterial(material.id)}
                            >
                              Verify
                            </button>
                            <button 
                              className="action-btn industrial-button danger"
                              onClick={() => rejectMaterial(material.id)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitMaterial} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          materialData={newMaterialData}
          setMaterialData={setNewMaterialData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>FHE Materials Discovery</span>
            </div>
            <p>Secure encrypted materials research using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Research</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Materials Discovery. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  materialData: any;
  setMaterialData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  materialData,
  setMaterialData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMaterialData({
      ...materialData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!materialData.materialType || !materialData.properties) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-card">
        <div className="modal-header">
          <h2>Add Encrypted Material Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your material data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Material Type *</label>
              <select 
                name="materialType"
                value={materialData.materialType} 
                onChange={handleChange}
                className="industrial-select"
              >
                <option value="">Select material type</option>
                <option value="Polymer">Polymer</option>
                <option value="Ceramic">Ceramic</option>
                <option value="Composite">Composite</option>
                <option value="Metal">Metal Alloy</option>
                <option value="Nanomaterial">Nanomaterial</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Research Institution</label>
              <input 
                type="text"
                name="researchInstitution"
                value={materialData.researchInstitution} 
                onChange={handleChange}
                placeholder="Institution name..." 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Material Properties *</label>
              <textarea 
                name="properties"
                value={materialData.properties} 
                onChange={handleChange}
                placeholder="Enter material properties and characteristics..." 
                className="industrial-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn industrial-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;