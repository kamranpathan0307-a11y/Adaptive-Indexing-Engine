#include "avl.h"

#include <algorithm>

AVLTree::AVLTree() : root_(nullptr), nodeCount_(0) {}

AVLTree::~AVLTree() {
    destroy(root_);
}

void AVLTree::destroy(Node* node) {
    if (!node) {
        return;
    }
    destroy(node->left);
    destroy(node->right);
    delete node;
}

void AVLTree::clear() {
    destroy(root_);
    root_ = nullptr;
    nodeCount_ = 0;
}

void AVLTree::insert(int key, const std::string& value, int initialAccessCount) {
    root_ = insertNode(root_, key, value, initialAccessCount);
}

std::optional<AVLTree::SearchResult> AVLTree::search(int key) {
    Node* found = find(root_, key);
    if (!found) {
        return std::nullopt;
    }
    ++found->accessCount;
    return SearchResult{found->value, found->accessCount};
}

bool AVLTree::contains(int key) const {
    return find(root_, key) != nullptr;
}

std::optional<int> AVLTree::accessCount(int key) const {
    Node* found = find(root_, key);
    if (!found) {
        return std::nullopt;
    }
    return found->accessCount;
}

int AVLTree::nodeCount() const {
    return nodeCount_;
}

std::vector<AVLNodeInfo> AVLTree::snapshot() const {
    std::vector<AVLNodeInfo> nodes;
    collect(root_, nodes);
    return nodes;
}

AVLTree::Node* AVLTree::insertNode(Node* node, int key, const std::string& value, int initialAccessCount) {
    if (!node) {
        ++nodeCount_;
        return new Node(key, value, initialAccessCount);
    }

    if (key < node->key) {
        node->left = insertNode(node->left, key, value, initialAccessCount);
    } else if (key > node->key) {
        node->right = insertNode(node->right, key, value, initialAccessCount);
    } else {
        node->value = value;
        node->accessCount = std::max(node->accessCount, initialAccessCount);
        return node;
    }

    updateHeight(node);
    int balance = balanceFactor(node);

    if (balance > 1 && key < node->left->key) {
        return rotateRight(node);
    }
    if (balance < -1 && key > node->right->key) {
        return rotateLeft(node);
    }
    if (balance > 1 && key > node->left->key) {
        node->left = rotateLeft(node->left);
        return rotateRight(node);
    }
    if (balance < -1 && key < node->right->key) {
        node->right = rotateRight(node->right);
        return rotateLeft(node);
    }

    return node;
}

// Right rotation resolves a left-left imbalance at node `y`.
AVLTree::Node* AVLTree::rotateRight(Node* y) {
    Node* x = y->left;
    Node* T2 = x->right;

    x->right = y;
    y->left = T2;

    // Update heights after rotation.
    updateHeight(y);
    updateHeight(x);

    return x;
}

// Left rotation resolves a right-right imbalance at node `x`.
AVLTree::Node* AVLTree::rotateLeft(Node* x) {
    Node* y = x->right;
    Node* T2 = y->left;

    y->left = x;
    x->right = T2;

    // Update heights after rotation.
    updateHeight(x);
    updateHeight(y);

    return y;
}

int AVLTree::height(Node* node) const {
    return node ? node->height : 0;
}

int AVLTree::balanceFactor(Node* node) const {
    return node ? height(node->left) - height(node->right) : 0;
}

void AVLTree::updateHeight(Node* node) {
    if (node) {
        node->height = 1 + std::max(height(node->left), height(node->right));
    }
}

AVLTree::Node* AVLTree::find(Node* node, int key) const {
    while (node) {
        if (key == node->key) {
            return node;
        }
        node = (key < node->key) ? node->left : node->right;
    }
    return nullptr;
}

void AVLTree::collect(Node* node, std::vector<AVLNodeInfo>& out) const {
    if (!node) {
        return;
    }
    collect(node->left, out);
    out.push_back(AVLNodeInfo{node->key, node->value, node->accessCount});
    collect(node->right, out);
}

