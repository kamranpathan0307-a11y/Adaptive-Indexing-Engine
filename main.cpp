#include "engine.h"
#include "crow/crow_all.h"
#include <stdexcept>
#include <string>

static crow::response make_cors_preflight() {
    crow::response res;
    res.code = 200;
    res.headers["Access-Control-Allow-Origin"]          = "*";
    res.headers["Access-Control-Allow-Private-Network"] = "true";
    res.headers["Access-Control-Allow-Methods"]         = "GET, POST, OPTIONS";
    res.headers["Access-Control-Allow-Headers"]         = "*";
    return res;
}

static crow::response make_json_response(const crow::json::wvalue& payload,
                                         int code = 200) {
    crow::response res;
    res.code = code;
    res.body = payload.dump();
    res.headers["Content-Type"]                         = "application/json";
    res.headers["Access-Control-Allow-Origin"]            = "*";
    res.headers["Access-Control-Allow-Private-Network"] = "true";
    return res;
}

static crow::response make_error(const std::string& message, int code = 400) {
    crow::json::wvalue payload;
    payload["error"] = message;
    return make_json_response(payload, code);
}

int main() {
    crow::SimpleApp app;
    AdaptiveIndexingEngine engine;

    auto to_string_value = [](int value) { return std::to_string(value); };

    // Health check
    app.route("/", [&](const crow::request& req, crow::response&&) {
        if (req.method == "OPTIONS")
            return make_cors_preflight();
        crow::response res;
        res.body = "{\"status\":\"Adaptive Indexing Engine running\"}";
        res.headers["Access-Control-Allow-Private-Network"] = "true";
        return res;
    });

    // Insert via query params: /insert?key=5&value=hello
    app.route("/insert", [&](const crow::request& req, crow::response&&) {
        if (req.method == "OPTIONS")
            return make_cors_preflight();

        auto keyParam = req.url_params.get("key");
        auto valueParam = req.url_params.get("value");
        if (!keyParam || !valueParam) {
            return make_error("key and value are required");
        }

        int key = std::stoi(keyParam);
        engine.insert(key, valueParam);

        crow::json::wvalue payload;
        payload["key"] = keyParam;
        payload["value"] = valueParam;
        payload["location"] =
            engine.isInAVL(key) ? "AVL Tree" : "B+ Tree";
        payload["accessCount"] =
            to_string_value(engine.accessCount(key).value_or(0));

        return make_json_response(payload);
    });

    app.route("/search", [&](const crow::request& req, crow::response&&) {
        if (req.method == "OPTIONS")
            return make_cors_preflight();

        auto keyParam = req.url_params.get("q");
        if (!keyParam) {
            return make_error("missing q");
        }

        auto promotionParam = req.url_params.get("promotionThreshold");
        if (promotionParam) {
            int threshold = 0;
            try {
                threshold = std::stoi(promotionParam);
            } catch (const std::exception&) {
                return make_error("promotionThreshold must be an integer", 400);
            }

            if (threshold < 1 || threshold > 10)
                return make_error("promotionThreshold must be between 1 and 10", 400);

            engine.setPromotionThreshold(threshold);
        }

        int key = std::stoi(keyParam);
        auto result = engine.search(key);
        if (!result) {
            return make_error("not found", 404);
        }

        crow::json::wvalue payload;
        payload["key"] = keyParam;
        payload["value"] = result->value;
        payload["location"] = result->location;
        payload["accessCount"] = to_string_value(result->accessCount);
        payload["promotionThreshold"] =
            to_string_value(engine.stats().promotionThreshold);

        return make_json_response(payload);
    });

    app.route("/stats", [&](const crow::request& req, crow::response&&) {
        if (req.method == "OPTIONS")
            return make_cors_preflight();

        auto stats = engine.stats();
        crow::json::wvalue payload;
        payload["avlNodeCount"]  = to_string_value(stats.avlNodeCount);
        payload["bplusNodeCount"]= to_string_value(stats.bplusNodeCount);
        payload["totalSearches"] = to_string_value(stats.totalSearches);
        payload["promotions"]    = to_string_value(stats.promotions);
        payload["bplusLeafCapacity"] = to_string_value(stats.bplusLeafCapacity);
        payload["promotionThreshold"] = to_string_value(stats.promotionThreshold);

        // AVL tree snapshot — use push_back for list; all ints via to_string_value
        auto avlNodes = engine.avlSnapshot();
        auto& avlList = payload["avlNodes"];
        avlList.type = crow::json::wvalue::Type::List;
        for (const auto& n : avlNodes) {
            crow::json::wvalue obj;
            obj["key"]         = to_string_value(n.key);
            obj["value"]       = n.value;
            obj["accessCount"] = to_string_value(n.accessCount);
            avlList.push_back(obj);
        }

        // B+ tree leaf snapshot
        auto leaves = engine.bplusSnapshot();
        auto& bpList = payload["bplusLeaves"];
        bpList.type = crow::json::wvalue::Type::List;
        for (const auto& leaf : leaves) {
            crow::json::wvalue lobj;
            lobj["id"] = to_string_value(leaf.id);
            auto& entList = lobj["entries"];
            entList.type = crow::json::wvalue::Type::List;
            for (const auto& e : leaf.entries) {
                crow::json::wvalue eobj;
                eobj["key"]         = to_string_value(e.key);
                eobj["value"]       = e.value;
                eobj["accessCount"] = to_string_value(e.accessCount);
                entList.push_back(eobj);
            }
            bpList.push_back(lobj);
        }

        return make_json_response(payload);
    });

    // Set B+ max keys per leaf before split (clears all engine data).
    // Minimal Crow build has no JSON body parser — use query string, e.g. /config?bplusLeafCapacity=6
    app.route("/config", [&](const crow::request& req, crow::response&&) {
        if (req.method == "OPTIONS")
            return make_cors_preflight();
        if (req.method != "GET")
            return make_error("GET required (use ?bplusLeafCapacity=N and/or ?promotionThreshold=N)", 405);

        auto capParam = req.url_params.get("bplusLeafCapacity");
        auto promotionParam = req.url_params.get("promotionThreshold");
        if (!capParam && !promotionParam)
            return make_error("missing bplusLeafCapacity or promotionThreshold query parameter", 400);

        bool cleared = false;
        if (capParam) {
            int cap = 0;
            try {
                cap = std::stoi(capParam);
            } catch (const std::exception&) {
                return make_error("bplusLeafCapacity must be an integer", 400);
            }

            if (cap < 2 || cap > 256)
                return make_error("bplusLeafCapacity must be between 2 and 256", 400);

            engine.setBplusLeafCapacity(cap);
            cleared = true;
        }

        if (promotionParam) {
            int threshold = 0;
            try {
                threshold = std::stoi(promotionParam);
            } catch (const std::exception&) {
                return make_error("promotionThreshold must be an integer", 400);
            }

            if (threshold < 1 || threshold > 10)
                return make_error("promotionThreshold must be between 1 and 10", 400);

            engine.setPromotionThreshold(threshold);
        }

        auto stats = engine.stats();

        crow::json::wvalue payload;
        payload["bplusLeafCapacity"] = to_string_value(stats.bplusLeafCapacity);
        payload["promotionThreshold"] = to_string_value(stats.promotionThreshold);
        payload["note"] = cleared
            ? "All AVL and B+ data was cleared; search and promotion counters were reset."
            : "Promotion threshold updated.";
        return make_json_response(payload);
    });

    app.port(18080).multithreaded().run();
    return 0;
}
