#include "engine.h"

AdaptiveIndexingEngine::AdaptiveIndexingEngine(int promotionThreshold, int bplusLeafCapacity)
    : avl_(),
      bplus_(bplusLeafCapacity),
      promotionThreshold_(promotionThreshold),
      totalSearches_(0),
      promotions_(0) {}

void AdaptiveIndexingEngine::setBplusLeafCapacity(int leafCapacity) {
    avl_.clear();
    bplus_.reconfigure(leafCapacity);
    totalSearches_ = 0;
    promotions_    = 0;
}

void AdaptiveIndexingEngine::insert(int key, const std::string& value) {
    if (avl_.contains(key)) {
        avl_.insert(key, value);
    } else {
        bplus_.insert(key, value);
    }
}

std::optional<SearchResponse> AdaptiveIndexingEngine::search(int key) {
    ++totalSearches_;

    if (auto avlResult = avl_.search(key)) {
        return SearchResponse{key, avlResult->value, "AVL Tree", avlResult->accessCount};
    }

    auto bplusResult = bplus_.search(key);
    if (!bplusResult) {
        return std::nullopt;
    }

    if (bplusResult->accessCount > promotionThreshold_) {
        if (auto promoted = bplus_.remove(key)) {
            avl_.insert(key, promoted->value, promoted->accessCount);
            ++promotions_;
            return SearchResponse{
                key, promoted->value, "AVL Tree", promoted->accessCount};
        }
    }

    return SearchResponse{key, bplusResult->value, "B+ Tree", bplusResult->accessCount};
}

EngineStats AdaptiveIndexingEngine::stats() const {
    return EngineStats{
        avl_.nodeCount(),
        bplus_.nodeCount(),
        totalSearches_,
        promotions_,
        bplus_.leafCapacity(),
    };
}

std::vector<AVLNodeInfo> AdaptiveIndexingEngine::avlSnapshot() const {
    return avl_.snapshot();
}

std::vector<BPlusLeafSnapshot> AdaptiveIndexingEngine::bplusSnapshot() const {
    return bplus_.snapshots();
}

bool AdaptiveIndexingEngine::isInAVL(int key) const {
    return avl_.contains(key);
}

std::optional<int> AdaptiveIndexingEngine::accessCount(int key) const {
    if (auto avlCount = avl_.accessCount(key)) {
        return avlCount;
    }
    return bplus_.accessCount(key);
}

