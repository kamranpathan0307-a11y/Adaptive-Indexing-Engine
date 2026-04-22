cmake_minimum_required(VERSION 3.20)
project(adaptive_indexing_engine)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Include header-only libraries
include_directories(include)

add_executable(adaptive-indexing-engine
    main.cpp
    src/avl.cpp
    src/bplustree.cpp
    src/engine.cpp
)
