#include "bplustree.h"

#include <algorithm>

BPlusTree::BPlusTree(int leafCapacity)
    : head_(nullptr), leafCapacity_(std::max(2, leafCapacity)), leafCount_(0) {}

BPlusTree::~BPlusTree() {
    deleteLeaves();
}

void BPlusTree::insert(int key, const std::string& value) {
    if (!head_) {
        head_ = new LeafNode();
        leafCount_ = 1;
    }

    LeafNode* leaf = findLeaf(key);
    auto it = std::lower_bound(leaf->keys.begin(), leaf->keys.end(), key);
    size_t index = std::distance(leaf->keys.begin(), it);

    if (it != leaf->keys.end() && *it == key) {
        leaf->values[index] = value;
        return;
    }

    leaf->keys.insert(it, key);
    leaf->values.insert(leaf->values.begin() + index, value);
    leaf->accessCounts.insert(leaf->accessCounts.begin() + index, 0);

    if (static_cast<int>(leaf->keys.size()) >= leafCapacity_) {
        splitLeaf(leaf);
    }
}

std::optional<BPlusEntry> BPlusTree::search(int key) {
    if (!head_) {
        return std::nullopt;
    }

    LeafNode* leaf = findLeaf(key);
    for (size_t i = 0; i < leaf->keys.size(); ++i) {
        if (leaf->keys[i] == key) {
            ++leaf->accessCounts[i];
            return BPlusEntry{key, leaf->values[i], leaf->accessCounts[i]};
        }
    }
    return std::nullopt;
}

std::optional<BPlusEntry> BPlusTree::remove(int key) {
    if (!head_) {
        return std::nullopt;
    }

    LeafNode* current = head_;
    LeafNode* previous = nullptr;

    while (current) {
        for (size_t i = 0; i < current->keys.size(); ++i) {
            if (current->keys[i] == key) {
                BPlusEntry entry{key, current->values[i], current->accessCounts[i]};
                current->keys.erase(current->keys.begin() + static_cast<int>(i));
                current->values.erase(current->values.begin() + static_cast<int>(i));
                current->accessCounts.erase(current->accessCounts.begin() + static_cast<int>(i));

                if (current->keys.empty()) {
                    if (previous) {
                        previous->next = current->next;
                    } else {
                        head_ = current->next;
                    }
                    delete current;
                    --leafCount_;
                }

                return entry;
            }
        }
        previous = current;
        current = current->next;
    }

    return std::nullopt;
}

std::optional<int> BPlusTree::accessCount(int key) const {
    if (!head_) {
        return std::nullopt;
    }

    LeafNode* leaf = findLeaf(key);
    for (size_t i = 0; i < leaf->keys.size(); ++i) {
        if (leaf->keys[i] == key) {
            return leaf->accessCounts[i];
        }
    }
    return std::nullopt;
}

std::vector<BPlusLeafSnapshot> BPlusTree::snapshots() const {
    std::vector<BPlusLeafSnapshot> snapshots;
    LeafNode* current = head_;
    int id = 1;
    while (current) {
        BPlusLeafSnapshot snapshot;
        snapshot.id = id++;
        for (size_t i = 0; i < current->keys.size(); ++i) {
            snapshot.entries.push_back(BPlusEntry{
                current->keys[i], current->values[i], current->accessCounts[i]});
        }
        snapshots.push_back(std::move(snapshot));
        current = current->next;
    }
    return snapshots;
}

int BPlusTree::nodeCount() const {
    return leafCount_;
}

void BPlusTree::reconfigure(int leafCapacity) {
    deleteLeaves();
    leafCapacity_ = std::max(2, leafCapacity);
}

BPlusTree::LeafNode* BPlusTree::findLeaf(int key) const {
    LeafNode* current = head_;
    while (current) {
        if (current->keys.empty() || key <= current->keys.back() || !current->next) {
            return current;
        }
        current = current->next;
    }
    return head_;
}

void BPlusTree::splitLeaf(LeafNode* leaf) {
    LeafNode* sibling = new LeafNode();
    int mid = static_cast<int>(leaf->keys.size()) / 2;

    sibling->keys.assign(leaf->keys.begin() + mid, leaf->keys.end());
    sibling->values.assign(leaf->values.begin() + mid, leaf->values.end());
    sibling->accessCounts.assign(leaf->accessCounts.begin() + mid, leaf->accessCounts.end());

    leaf->keys.erase(leaf->keys.begin() + mid, leaf->keys.end());
    leaf->values.erase(leaf->values.begin() + mid, leaf->values.end());
    leaf->accessCounts.erase(leaf->accessCounts.begin() + mid, leaf->accessCounts.end());

    sibling->next = leaf->next;
    leaf->next = sibling;
    ++leafCount_;
}

void BPlusTree::deleteLeaves() {
    LeafNode* current = head_;
    while (current) {
        LeafNode* next = current->next;
        delete current;
        current = next;
    }
    head_ = nullptr;
    leafCount_ = 0;
}

