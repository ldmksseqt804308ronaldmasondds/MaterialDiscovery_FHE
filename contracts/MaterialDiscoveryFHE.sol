// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MaterialDiscoveryFHE is SepoliaConfig {
    struct EncryptedMaterialData {
        uint256 dataId;
        euint32 encryptedProperties;    // Encrypted material properties
        euint32 encryptedStructure;      // Encrypted atomic structure
        euint32 encryptedPerformance;    // Encrypted performance metrics
        uint256 timestamp;
    }
    
    struct EncryptedAIModel {
        uint256 modelId;
        euint32 encryptedWeights;       // Encrypted model parameters
        euint32 encryptedFeatures;      // Encrypted feature importance
    }
    
    struct DecryptedPrediction {
        uint32 discoveryScore;
        uint32 stabilityEstimate;
        bool isPredicted;
    }

    uint256 public materialDataCount;
    uint256 public modelCount;
    mapping(uint256 => EncryptedMaterialData) public materialDatabase;
    mapping(uint256 => EncryptedAIModel) public predictionModels;
    mapping(uint256 => DecryptedPrediction) public materialPredictions;
    
    mapping(uint256 => euint32) private encryptedResearchStats;
    uint256[] private researchList;
    
    mapping(uint256 => uint256) private requestToDataId;
    
    event DataSubmitted(uint256 indexed dataId, uint256 timestamp);
    event ModelUploaded(uint256 indexed modelId);
    event PredictionRequested(uint256 indexed dataId);
    event PredictionCompleted(uint256 indexed dataId);
    
    modifier onlyResearcher() {
        // Add researcher authorization logic
        _;
    }
    
    modifier onlyModelOwner() {
        // Add model owner authorization
        _;
    }
    
    function submitMaterialData(
        euint32 encryptedProperties,
        euint32 encryptedStructure,
        euint32 encryptedPerformance
    ) public onlyResearcher {
        materialDataCount += 1;
        uint256 newId = materialDataCount;
        
        materialDatabase[newId] = EncryptedMaterialData({
            dataId: newId,
            encryptedProperties: encryptedProperties,
            encryptedStructure: encryptedStructure,
            encryptedPerformance: encryptedPerformance,
            timestamp: block.timestamp
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    function uploadAIModel(
        euint32 encryptedWeights,
        euint32 encryptedFeatures
    ) public onlyModelOwner {
        modelCount += 1;
        uint256 newId = modelCount;
        
        predictionModels[newId] = EncryptedAIModel({
            modelId: newId,
            encryptedWeights: encryptedWeights,
            encryptedFeatures: encryptedFeatures
        });
        
        emit ModelUploaded(newId);
    }
    
    function requestMaterialPrediction(
        uint256 dataId,
        uint256 modelId
    ) public onlyResearcher {
        EncryptedMaterialData storage data = materialDatabase[dataId];
        EncryptedAIModel storage model = predictionModels[modelId];
        
        bytes32[] memory ciphertexts = new bytes32[](5);
        ciphertexts[0] = FHE.toBytes32(data.encryptedProperties);
        ciphertexts[1] = FHE.toBytes32(data.encryptedStructure);
        ciphertexts[2] = FHE.toBytes32(data.encryptedPerformance);
        ciphertexts[3] = FHE.toBytes32(model.encryptedWeights);
        ciphertexts[4] = FHE.toBytes32(model.encryptedFeatures);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.predictMaterial.selector);
        requestToDataId[reqId] = dataId;
        
        emit PredictionRequested(dataId);
    }
    
    function predictMaterial(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        uint32 properties = results[0];
        uint32 structure = results[1];
        uint32 performance = results[2];
        uint32 weights = results[3];
        uint32 features = results[4];
        
        // Simplified prediction algorithm
        uint32 discoveryScore = (properties * weights + structure * features) / 100;
        uint32 stabilityEstimate = (performance * weights) / 100;
        
        materialPredictions[dataId] = DecryptedPrediction({
            discoveryScore: discoveryScore,
            stabilityEstimate: stabilityEstimate,
            isPredicted: true
        });
        
        emit PredictionCompleted(dataId);
    }
    
    function getMaterialPrediction(uint256 dataId) public view returns (
        uint32 discoveryScore,
        uint32 stabilityEstimate,
        bool isPredicted
    ) {
        DecryptedPrediction storage p = materialPredictions[dataId];
        return (p.discoveryScore, p.stabilityEstimate, p.isPredicted);
    }
    
    function calculateCompositeProperties(euint32[] memory properties) public pure returns (euint32) {
        euint32 total = FHE.asEuint32(0);
        for (uint i = 0; i < properties.length; i++) {
            total = FHE.add(total, properties[i]);
        }
        return FHE.div(total, FHE.asEuint32(uint32(properties.length)));
    }
    
    function requestResearchStatistics(uint256 researchId) public onlyResearcher {
        euint32 stats = encryptedResearchStats[researchId];
        require(FHE.isInitialized(stats), "Research not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(stats);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptResearchStats.selector);
        requestToDataId[reqId] = researchId;
    }
    
    function decryptResearchStats(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 researchId = requestToDataId[requestId];
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 stats = abi.decode(cleartexts, (uint32));
        // Handle decrypted research statistics
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
}