#pragma once

#include <string>
#include <vector>
#include <optional>

struct AVLNodeInfo {
    int key;
    std::string value;
    int accessCount;
};

class AVLTree {
public:
    AVLTree();
    ~AVLTree();

    struct SearchResult {
        std::string value;
        int accessCount;
    };

    void insert(int key, const std::string& value, int initialAccessCount = 0);
    void clear();
    std::optional<SearchResult> search(int key);
    bool contains(int key) const;
    std::optional<int> accessCount(int key) const;
    int nodeCount() const;
    std::vector<AVLNodeInfo> snapshot() const;

private:
    struct Node {
        int key;
        std::string value;
        int height;
        int accessCount;
        Node* left;
        Node* right;

        Node(int key_, const std::string& value_, int accessCount_ = 0)
            : key(key_), value(value_), height(1), accessCount(accessCount_), left(nullptr), right(nullptr) {}
    };

    Node* root_;
    int nodeCount_;

    void destroy(Node* node);
    Node* insertNode(Node* node, int key, const std::string& value, int initialAccessCount);
    Node* rotateRight(Node* y);
    Node* rotateLeft(Node* x);
    int height(Node* node) const;
    int balanceFactor(Node* node) const;
    void updateHeight(Node* node);
    Node* find(Node* node, int key) const;
    void collect(Node* node, std::vector<AVLNodeInfo>& out) const;
};

