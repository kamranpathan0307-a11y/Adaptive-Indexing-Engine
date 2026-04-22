#pragma once

#include <string>
#include <vector>
#include <optional>

struct BPlusEntry {
    int key;
    std::string value;
    int accessCount;
};

struct BPlusLeafSnapshot {
    int id;
    std::vector<BPlusEntry> entries;
};

class BPlusTree {
public:
    explicit BPlusTree(int leafCapacity = 4);
    ~BPlusTree();

    void insert(int key, const std::string& value);
    std::optional<BPlusEntry> search(int key);
    std::optional<BPlusEntry> remove(int key);
    std::optional<int> accessCount(int key) const;
    std::vector<BPlusLeafSnapshot> snapshots() const;
    int nodeCount() const;
    /** Split threshold per leaf; split runs when size reaches this (e.g. 5 -> 5th insert splits). */
    int leafCapacity() const { return leafCapacity_; }
    void reconfigure(int leafCapacity);

private:
    struct LeafNode {
        std::vector<int> keys;
        std::vector<std::string> values;
        std::vector<int> accessCounts;
        LeafNode* next = nullptr;
    };

    LeafNode* head_;
    int leafCapacity_;
    int leafCount_;

    LeafNode* findLeaf(int key) const;
    void splitLeaf(LeafNode* leaf);
    void deleteLeaves();
};

