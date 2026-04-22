#pragma once

/*
 * Minimal but FUNCTIONAL Crow-compatible HTTP server for Windows.
 * Keeps the exact same public API so main.cpp needs zero changes,
 * but run() now actually listens on a TCP socket via WinSock2.
 */

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")

#include <functional>
#include <map>
#include <string>
#include <vector>
#include <sstream>
#include <cstdio>
#include <cstring>

namespace crow {

/* ════════════════════════════════════════════
   URL helpers
════════════════════════════════════════════ */
inline std::string url_decode(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '%' && i + 2 < s.size()) {
            unsigned int v = 0;
            sscanf(s.c_str() + i + 1, "%2x", &v);
            out += static_cast<char>(v);
            i += 2;
        } else if (s[i] == '+') {
            out += ' ';
        } else {
            out += s[i];
        }
    }
    return out;
}

inline std::map<std::string,std::string> parse_query(const std::string& qs) {
    std::map<std::string,std::string> p;
    std::string key, val;
    bool in_key = true;
    for (char c : qs) {
        if      (c == '&')        { if (!key.empty()) p[url_decode(key)] = url_decode(val); key.clear(); val.clear(); in_key = true; }
        else if (c == '=' && in_key) { in_key = false; }
        else if (in_key)          { key += c; }
        else                      { val += c; }
    }
    if (!key.empty()) p[url_decode(key)] = url_decode(val);
    return p;
}

/* ════════════════════════════════════════════
   request / response  (same API as before)
════════════════════════════════════════════ */
struct request {
    struct query_params {
        std::map<std::string, std::string> params;
        const char* get(const std::string& key) const {
            auto it = params.find(key);
            return it == params.end() ? nullptr : it->second.c_str();
        }
    };
    query_params url_params;
    std::string  method;
    std::string  url;
};

struct response {
    int code = 200;
    std::string body;
    std::map<std::string, std::string> headers;
};

/* ════════════════════════════════════════════
   wvalue  — identical to original stub
════════════════════════════════════════════ */
namespace json {
    struct wvalue {
        enum class Type { Text, Map, List };

        Type type = Type::Text;
        std::map<std::string, wvalue> map;
        std::vector<wvalue>           list;
        std::string                   text;

        wvalue() = default;
        explicit wvalue(const std::string& value) : type(Type::Text), text(value) {}
        explicit wvalue(const char* value)        : type(Type::Text), text(value ? value : "") {}

        wvalue& operator=(const std::string& value) {
            type = Type::Text; map.clear(); list.clear(); text = value;
            return *this;
        }
        wvalue& operator=(const char* value) {
            return operator=(value ? std::string(value) : std::string());
        }
        wvalue& operator[](const std::string& key) {
            type = Type::Map;
            return map[key];
        }
        void push_back(const wvalue& v) {
            type = Type::List;
            list.push_back(v);
        }
        static wvalue list_value() {
            wvalue v; v.type = Type::List; return v;
        }

        std::string dump() const {
            if (type == Type::List) {
                std::string out = "[";
                for (size_t i = 0; i < list.size(); ++i) {
                    if (i) out += ",";
                    out += list[i].dump();
                }
                return out + "]";
            }
            if (type == Type::Map) {
                std::string out = "{";
                size_t n = 0;
                for (const auto& kv : map) {
                    if (n++) out += ",";
                    out += "\"" + kv.first + "\":" + kv.second.dump();
                }
                return out + "}";
            }
            // Text: JSON-escape
            std::ostringstream oss;
            oss << '"';
            for (char ch : text) {
                switch (ch) {
                    case '"':  oss << "\\\""; break;
                    case '\\': oss << "\\\\"; break;
                    case '\n': oss << "\\n";  break;
                    case '\r': oss << "\\r";  break;
                    default:   oss << ch;     break;
                }
            }
            oss << '"';
            return oss.str();
        }
    };
} // namespace json

/* ════════════════════════════════════════════
   SimpleApp  —  real TCP/HTTP server
════════════════════════════════════════════ */
class SimpleApp {
public:
    using Handler = std::function<response(const request&, response&&)>;

    template <typename H>
    void route(const std::string& path, H&& handler) {
        handlers_[path] = [h = std::forward<H>(handler)](const request& req, response&&) {
            return h(req, response{});
        };
    }

    SimpleApp& port(int p)     { port_ = p; return *this; }
    SimpleApp& multithreaded() { return *this; }

    void run() {
        /* ── Init WinSock ── */
        WSADATA wsa{};
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
            fprintf(stderr, "[crow] WSAStartup failed (%d)\n", WSAGetLastError());
            return;
        }

        SOCKET srv = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (srv == INVALID_SOCKET) {
            fprintf(stderr, "[crow] socket() failed (%d)\n", WSAGetLastError());
            WSACleanup(); return;
        }

        /* Allow port reuse between runs */
        int opt = 1;
        setsockopt(srv, SOL_SOCKET, SO_REUSEADDR,
                   reinterpret_cast<const char*>(&opt), sizeof(opt));

        sockaddr_in addr{};
        addr.sin_family      = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port        = htons(static_cast<u_short>(port_));

        if (bind(srv, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == SOCKET_ERROR) {
            fprintf(stderr, "[crow] bind() failed (%d) — is port %d already in use?\n",
                    WSAGetLastError(), port_);
            closesocket(srv); WSACleanup(); return;
        }
        listen(srv, SOMAXCONN);

        printf("[crow] Adaptive Indexing Engine running on http://localhost:%d\n", port_);
        fflush(stdout);

        /* ── Accept loop (single-threaded, sequential) ── */
        while (true) {
            SOCKET client = accept(srv, nullptr, nullptr);
            if (client == INVALID_SOCKET) continue;
            serve(client);
            closesocket(client);
        }

        closesocket(srv);
        WSACleanup();
    }

private:
    std::map<std::string, Handler> handlers_;
    int port_ = 18080;

    void serve(SOCKET client) {
        char buf[16384] = {};
        int  n = recv(client, buf, sizeof(buf) - 1, 0);
        if (n <= 0) return;

        std::string raw(buf, static_cast<size_t>(n));

        /* Parse: "METHOD /path?qs HTTP/1.x" */
        size_t eol = raw.find("\r\n");
        if (eol == std::string::npos) return;
        std::string line = raw.substr(0, eol);

        size_t s1 = line.find(' ');
        if (s1 == std::string::npos) return;
        size_t s2 = line.find(' ', s1 + 1);
        if (s2 == std::string::npos) return;

        std::string method    = line.substr(0, s1);
        std::string full_path = line.substr(s1 + 1, s2 - s1 - 1);

        /* Split path and query string */
        std::string path, qs;
        size_t q = full_path.find('?');
        if (q != std::string::npos) { path = full_path.substr(0, q); qs = full_path.substr(q + 1); }
        else                        { path = full_path; }

        /* CORS preflight */
        if (method == "OPTIONS") {
            const char* pre =
                "HTTP/1.1 204 No Content\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Private-Network: true\r\n"
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                "Access-Control-Allow-Headers: *\r\n"
                "Connection: close\r\n\r\n";
            send(client, pre, static_cast<int>(strlen(pre)), 0);
            return;
        }

        /* Build request */
        request req;
        req.method = method;
        req.url    = path;
        if (!qs.empty()) req.url_params.params = parse_query(qs);

        /* Dispatch */
        response res;
        auto it = handlers_.find(path);
        if (it != handlers_.end()) {
            res = it->second(req, response{});
        } else {
            res.code = 404;
            res.body = "{\"error\":\"route not found\"}";
            res.headers["Content-Type"] = "application/json";
        }

        /* Send HTTP response */
        const char* reason =
            res.code == 200 ? "OK" :
            res.code == 404 ? "Not Found" : "Bad Request";

        std::ostringstream out;
        out << "HTTP/1.1 " << res.code << " " << reason << "\r\n";
        if (res.headers.find("Access-Control-Allow-Origin") == res.headers.end()) {
            out << "Access-Control-Allow-Origin: *\r\n";
        }
        out << "Connection: close\r\n";
        for (const auto& h : res.headers)
            out << h.first << ": " << h.second << "\r\n";
        out << "Content-Length: " << res.body.size() << "\r\n\r\n";
        out << res.body;

        std::string resp = out.str();
        send(client, resp.c_str(), static_cast<int>(resp.size()), 0);
    }
};

} // namespace crow

#define CROW_ROUTE(app, path) (app).route(path)
