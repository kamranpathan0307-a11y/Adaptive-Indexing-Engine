#pragma once

#include <optional>
#include <string>
#include <vector>

#include "avl.h"
#include "bplustree.h"

struct SearchResponse {
    int key;
    std::string value;
    std::string location;
    int accessCount;
};

struct EngineStats {
    int avlNodeCount;
    int bplusNodeCount;
    int totalSearches;
    int promotions;
    int bplusLeafCapacity;
    int promotionThreshold;
};

class AdaptiveIndexingEngine {
public:
    explicit AdaptiveIndexingEngine(int promotionThreshold = 3, int bplusLeafCapacity = 4);

    void insert(int key, const std::string& value);
    /** Clears AVL and B+ data and resets search/promotion counters. */
    void setBplusLeafCapacity(int leafCapacity);
    void setPromotionThreshold(int threshold);
    std::optional<SearchResponse> search(int key);
    EngineStats stats() const;
    std::vector<AVLNodeInfo> avlSnapshot() const;
    std::vector<BPlusLeafSnapshot> bplusSnapshot() const;
    bool isInAVL(int key) const;
    std::optional<int> accessCount(int key) const;

private:
    AVLTree avl_;
    BPlusTree bplus_;
    int promotionThreshold_;
    int totalSearches_;
    int promotions_;
};

