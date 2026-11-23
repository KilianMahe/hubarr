// SPDX-License-Identifier: AGPL-3.0-or-later
// Fichier généré par tools/generate-openapi-types.js depuis la spécification
// OpenAPI de Radarr/Radarr v7.0.3.10918 (API 3.0.0). Ne pas modifier à la main :
// make openapi SERVICE=radarr

export interface paths {
    "/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    path: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    path: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ApiInfoResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/alttitle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieId?: number;
                    movieMetadataId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AlternativeTitleResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/alttitle/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AlternativeTitleResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/autotagging": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutoTaggingResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["AutoTaggingResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutoTaggingResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/autotagging/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutoTaggingResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["AutoTaggingResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutoTaggingResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/autotagging/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutoTaggingSpecificationSchema"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/blocklist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieIds?: number[];
                    page?: number;
                    pageSize?: number;
                    protocols?: components["schemas"]["DownloadProtocol"][];
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BlocklistResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/blocklist/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/blocklist/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["BlocklistBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/blocklist/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BlocklistResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/calendar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    end?: string;
                    start?: string;
                    tags?: string;
                    unmonitored?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/collection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    tmdbId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CollectionResource"][];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CollectionUpdateResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CollectionResource"][];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/collection/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CollectionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CollectionResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CollectionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/command": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CommandResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CommandResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CommandResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/command/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CommandResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/downloadclient": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/downloadclient/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/host": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HostConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/host/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HostConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["HostConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HostConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/importlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/importlist/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/indexer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/indexer/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/mediamanagement": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaManagementConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/mediamanagement/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaManagementConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MediaManagementConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaManagementConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/metadata/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MetadataConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/naming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NamingConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/naming/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NamingConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["NamingConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NamingConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/naming/examples": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    colonReplacementFormat?: components["schemas"]["ColonReplacementFormat"];
                    id?: number;
                    movieFolderFormat?: string;
                    renameMovies?: boolean;
                    replaceIllegalCharacters?: boolean;
                    resourceName?: string;
                    standardMovieFormat?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NamingExampleResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/ui": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UiConfigResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/config/ui/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UiConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["UiConfigResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UiConfigResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/credit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieId?: number;
                    movieMetadataId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreditResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/credit/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreditResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/customfilter": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFilterResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CustomFilterResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFilterResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/customfilter/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFilterResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CustomFilterResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFilterResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/customformat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFormatResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CustomFormatResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFormatResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/customformat/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFormatResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CustomFormatResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFormatResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/customformat/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CustomFormatBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFormatResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CustomFormatBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/customformat/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CustomFormatSpecificationSchema"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/delayprofile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DelayProfileResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DelayProfileResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DelayProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/delayprofile/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DelayProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DelayProfileResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DelayProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/delayprofile/reorder/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: {
                    after?: number;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DelayProfileResource"][];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/diskspace": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiskSpaceResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient/action/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientResource"];
                };
            };
            responses: {
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DownloadClientResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceTest?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["DownloadClientResource"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/downloadclient/testall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/exclusions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @deprecated */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListExclusionResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListExclusionResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListExclusionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/exclusions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListExclusionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListExclusionResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListExclusionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/exclusions/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListExclusionResource"][];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListExclusionResource"][];
                    };
                };
            };
        };
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListExclusionBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/exclusions/paged": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    page?: number;
                    pageSize?: number;
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListExclusionResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/extrafile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ExtraFileResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/filesystem": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    allowFoldersWithoutTrailingSlashes?: boolean;
                    includeFiles?: boolean;
                    path?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FileSystemResult"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/filesystem/mediafiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    path?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FileSystemMediaFileResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/filesystem/type": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    path?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FileSystemTypeResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HealthResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    downloadId?: string;
                    eventType?: number[];
                    includeMovie?: boolean;
                    languages?: number[];
                    movieIds?: number[];
                    page?: number;
                    pageSize?: number;
                    quality?: number[];
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HistoryResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/history/failed/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/history/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    eventType?: components["schemas"]["MovieHistoryEventType"];
                    includeMovie?: boolean;
                    movieId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HistoryResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/history/since": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    date?: string;
                    eventType?: components["schemas"]["MovieHistoryEventType"];
                    includeMovie?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HistoryResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/action/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListResource"];
                };
            };
            responses: {
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includePopular?: boolean;
                    includeRecommendations?: boolean;
                    includeTrending?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListMoviesResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieResource"][];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportListResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceTest?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ImportListResource"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/importlist/testall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer/action/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerResource"];
                };
            };
            responses: {
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceTest?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["IndexerResource"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexer/testall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/indexerflag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IndexerFlagResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/language": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LanguageResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/language/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LanguageResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/localization": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/localization/language": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LocalizationLanguageResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/log": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    level?: string;
                    page?: number;
                    pageSize?: number;
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LogResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/log/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LogFileResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/log/file/{filename}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    filename: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": string;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/log/file/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LogFileResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/log/file/update/{filename}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    filename: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": string;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/manualimport": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    downloadId?: string;
                    filterExistingFiles?: boolean;
                    folder?: string;
                    movieId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ManualImportResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ManualImportReprocessResource"][];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ManualImportReprocessResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/mediacover/{movieId}/{filename}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    filename: string;
                    movieId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MetadataResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/metadata/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MetadataResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/metadata/action/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MetadataResource"];
                };
            };
            responses: {
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/metadata/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/metadata/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceTest?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MetadataResource"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/metadata/testall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    excludeLocalCovers?: boolean;
                    languageId?: number;
                    tmdbId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: {
                    moveFiles?: boolean;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: {
                    addImportExclusion?: boolean;
                    deleteFiles?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/{id}/folder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieFolderResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/editor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieEditorResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieEditorResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieResource"][];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    term?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/lookup/imdb": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    imdbId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/movie/lookup/tmdb": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    tmdbId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/moviefile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieFileIds?: number[];
                    movieId?: number[];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieFileResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/moviefile/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieFileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieFileResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieFileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/moviefile/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieFileResource"][];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieFileResource"][];
                    };
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieFileListResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/moviefile/editor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @deprecated */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MovieFileListResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieFileResource"][];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/notification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["NotificationResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/notification/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: {
                    forceSave?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["NotificationResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/notification/action/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["NotificationResource"];
                };
            };
            responses: {
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/notification/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/notification/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: {
                    forceTest?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["NotificationResource"];
                };
            };
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/notification/testall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProviderTestAllResult"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/parse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    title?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ParseResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualitydefinition": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityDefinitionResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualitydefinition/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityDefinitionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["QualityDefinitionResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityDefinitionResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualitydefinition/limits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityDefinitionLimitsResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualitydefinition/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["QualityDefinitionResource"][];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityDefinitionResource"][];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualityprofile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityProfileResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["QualityProfileResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualityprofile/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["QualityProfileResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/qualityprofile/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QualityProfileResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeMovie?: boolean;
                    includeUnknownMovieItems?: boolean;
                    languages?: number[];
                    movieIds?: number[];
                    page?: number;
                    pageSize?: number;
                    protocol?: components["schemas"]["DownloadProtocol"];
                    quality?: number[];
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                    status?: components["schemas"]["QueueStatus"][];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QueueResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: {
                    blocklist?: boolean;
                    changeCategory?: boolean;
                    removeFromClient?: boolean;
                    skipRedownload?: boolean;
                };
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: {
                    blocklist?: boolean;
                    changeCategory?: boolean;
                    removeFromClient?: boolean;
                    skipRedownload?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["QueueBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue/details": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeMovie?: boolean;
                    movieId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QueueResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue/grab/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue/grab/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["QueueBulkResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/queue/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QueueStatusResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieId?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ReleaseResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/release/push": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ReleaseResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/releaseprofile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseProfileResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ReleaseProfileResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/releaseprofile/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ReleaseProfileResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReleaseProfileResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/remotepathmapping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RemotePathMappingResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["RemotePathMappingResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RemotePathMappingResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/remotepathmapping/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RemotePathMappingResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["RemotePathMappingResource"];
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RemotePathMappingResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/rename": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    movieId?: number[];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RenameMovieResource"][];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/rootfolder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RootFolderResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["RootFolderResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RootFolderResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/rootfolder/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RootFolderResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/backup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BackupResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/backup/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": unknown;
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/backup/restore/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BackupRestoreResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/backup/restore/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BackupRestoreResource"];
                    };
                };
                /** @description Bad Request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BackupRestoreErrorResource"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/restart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SystemRestartResource"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/routes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": string;
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/routes/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            [key: string]: string[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/shutdown": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SystemShutdownResource"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SystemResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/task": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TaskResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/system/task/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TaskResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/tag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TagResource"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["TagResource"];
                };
            };
            responses: {
                /** @description Created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TagResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/tag/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TagResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["TagResource"];
                };
            };
            responses: {
                /** @description Accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TagResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/tag/detail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TagDetailsResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/tag/detail/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TagDetailsResource"];
                    };
                };
                /** @description Not Found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UpdateResource"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/wanted/cutoff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    monitored?: boolean;
                    page?: number;
                    pageSize?: number;
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v3/wanted/missing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    monitored?: boolean;
                    page?: number;
                    pageSize?: number;
                    sortDirection?: components["schemas"]["SortDirection"];
                    sortKey?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieResourcePagingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/content/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    path: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/feed/v3/calendar/radarr.ics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    futureDays?: number;
                    pastDays?: number;
                    releaseTypes?: components["schemas"]["CalendarReleaseType"][];
                    tags?: string;
                    unmonitored?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description No Content */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/loggedout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: {
                    returnUrl?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "multipart/form-data": {
                        password?: string;
                        rememberMe?: string;
                        username?: string;
                    };
                };
            };
            responses: {
                /** @description Found */
                302: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProblemDetails"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/login/sso": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    returnUrl?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Found */
                302: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Found */
                302: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PingResource"];
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PingResource"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PingResource"];
                    };
                };
                /** @description Internal Server Error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PingResource"];
                    };
                };
            };
        };
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        AddMovieMethod: "manual" | "list" | "collection";
        AddMovieOptions: {
            addMethod?: components["schemas"]["AddMovieMethod"];
            ignoreEpisodesWithFiles?: boolean;
            ignoreEpisodesWithoutFiles?: boolean;
            monitor?: components["schemas"]["MonitorTypes"];
            searchForMovie?: boolean;
        };
        AlternativeTitle: {
            cleanTitle?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            movieMetadataId?: number;
            sourceType?: components["schemas"]["SourceType"];
            title?: string | null;
        };
        AlternativeTitleResource: {
            cleanTitle?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            movieMetadataId?: number;
            sourceType?: components["schemas"]["SourceType"];
            title?: string | null;
        };
        ApiInfoResource: {
            current?: string | null;
            deprecated?: string[] | null;
        };
        /** @enum {string} */
        ApplyTags: "add" | "remove" | "replace";
        /** @enum {string} */
        AuthenticationRequiredType: "enabled" | "disabledForLocalAddresses" | "disabledForLocalhost";
        /** @enum {string} */
        AuthenticationType: "none" | "basic" | "forms" | "external" | "oidc";
        AutoTaggingResource: {
            /** Format: int32 */
            id?: number;
            name?: string | null;
            removeTagsAutomatically?: boolean;
            specifications?: components["schemas"]["AutoTaggingSpecificationSchema"][] | null;
            tags?: number[] | null;
        };
        AutoTaggingSpecificationSchema: {
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            name?: string | null;
            negate?: boolean;
            required?: boolean;
        };
        BackupResource: {
            /** Format: int32 */
            id?: number;
            name?: string | null;
            path?: string | null;
            /** Format: int64 */
            size?: number;
            /** Format: date-time */
            time?: string;
            type?: components["schemas"]["BackupType"];
        };
        BackupRestoreErrorResource: {
            error?: string | null;
        };
        BackupRestoreResource: {
            restartRequired?: boolean;
        };
        /** @enum {string} */
        BackupType: "scheduled" | "manual" | "update";
        BlocklistBulkResource: {
            ids?: number[] | null;
        };
        BlocklistResource: {
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: date-time */
            date?: string;
            /** Format: int32 */
            id?: number;
            indexer?: string | null;
            languages?: components["schemas"]["Language"][] | null;
            message?: string | null;
            movie?: components["schemas"]["MovieResource"];
            /** Format: int32 */
            movieId?: number;
            protocol?: components["schemas"]["DownloadProtocol"];
            quality?: components["schemas"]["QualityModel"];
            sourceTitle?: string | null;
        };
        BlocklistResourcePagingResource: {
            /** Format: int32 */
            page?: number;
            /** Format: int32 */
            pageSize?: number;
            records?: components["schemas"]["BlocklistResource"][] | null;
            sortDirection?: components["schemas"]["SortDirection"];
            sortKey?: string | null;
            /** Format: int32 */
            totalRecords?: number;
        };
        /** @enum {string} */
        CalendarReleaseType: "cinemaRelease" | "digitalRelease" | "physicalRelease";
        /** @enum {string} */
        CertificateValidationType: "enabled" | "disabledForLocalAddresses" | "disabled";
        CollectionMovieResource: {
            cleanTitle?: string | null;
            folder?: string | null;
            genres?: string[] | null;
            images?: components["schemas"]["MediaCover"][] | null;
            imdbId?: string | null;
            isExcluded?: boolean;
            isExisting?: boolean;
            overview?: string | null;
            ratings?: components["schemas"]["Ratings"];
            /** Format: int32 */
            runtime?: number;
            sortTitle?: string | null;
            status?: components["schemas"]["MovieStatusType"];
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
            /** Format: int32 */
            year?: number;
        };
        CollectionResource: {
            /** Format: int32 */
            id?: number;
            images?: components["schemas"]["MediaCover"][] | null;
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            /** Format: int32 */
            missingMovies?: number;
            monitored?: boolean;
            movies?: components["schemas"]["CollectionMovieResource"][] | null;
            overview?: string | null;
            /** Format: int32 */
            qualityProfileId?: number;
            rootFolderPath?: string | null;
            searchOnAdd?: boolean;
            sortTitle?: string | null;
            tags?: number[] | null;
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
        };
        CollectionUpdateResource: {
            collectionIds?: number[] | null;
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            monitored?: boolean | null;
            monitorMovies?: boolean | null;
            /** Format: int32 */
            qualityProfileId?: number | null;
            rootFolderPath?: string | null;
            searchOnAdd?: boolean | null;
        };
        /** @enum {string} */
        ColonReplacementFormat: "delete" | "dash" | "spaceDash" | "spaceDashSpace" | "smart";
        Command: {
            clientUserAgent?: string | null;
            readonly completionMessage?: string | null;
            readonly isExclusive?: boolean;
            readonly isLongRunning?: boolean;
            readonly isTypeExclusive?: boolean;
            /** Format: date-time */
            lastExecutionTime?: string | null;
            /** Format: date-time */
            lastStartTime?: string | null;
            readonly name?: string | null;
            readonly requiresDiskAccess?: boolean;
            sendUpdatesToClient?: boolean;
            suppressMessages?: boolean;
            trigger?: components["schemas"]["CommandTrigger"];
            readonly updateScheduledTask?: boolean;
        };
        /** @enum {string} */
        CommandPriority: "normal" | "high" | "low";
        CommandResource: {
            body?: components["schemas"]["Command"];
            clientUserAgent?: string | null;
            commandName?: string | null;
            /** Format: date-span */
            duration?: string | null;
            /** Format: date-time */
            ended?: string | null;
            exception?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: date-time */
            lastExecutionTime?: string | null;
            message?: string | null;
            name?: string | null;
            priority?: components["schemas"]["CommandPriority"];
            /** Format: date-time */
            queued?: string;
            result?: components["schemas"]["CommandResult"];
            sendUpdatesToClient?: boolean;
            /** Format: date-time */
            started?: string | null;
            /** Format: date-time */
            stateChangeTime?: string | null;
            status?: components["schemas"]["CommandStatus"];
            trigger?: components["schemas"]["CommandTrigger"];
            updateScheduledTask?: boolean;
        };
        /** @enum {string} */
        CommandResult: "unknown" | "successful" | "unsuccessful";
        /** @enum {string} */
        CommandStatus: "queued" | "started" | "completed" | "failed" | "aborted" | "cancelled" | "orphaned";
        /** @enum {string} */
        CommandTrigger: "unspecified" | "manual" | "scheduled";
        CreditResource: {
            character?: string | null;
            creditTmdbId?: string | null;
            department?: string | null;
            /** Format: int32 */
            id?: number;
            images?: components["schemas"]["MediaCover"][] | null;
            job?: string | null;
            /** Format: int32 */
            movieMetadataId?: number;
            /** Format: int32 */
            order?: number;
            personName?: string | null;
            /** Format: int32 */
            personTmdbId?: number;
            type?: components["schemas"]["CreditType"];
        };
        /** @enum {string} */
        CreditType: "cast" | "crew";
        CustomFilterResource: {
            filters?: {
                [key: string]: unknown;
            }[] | null;
            /** Format: int32 */
            id?: number;
            label?: string | null;
            type?: string | null;
        };
        CustomFormatBulkResource: {
            ids?: number[] | null;
            includeCustomFormatWhenRenaming?: boolean | null;
        };
        CustomFormatResource: {
            /** Format: int32 */
            id?: number;
            includeCustomFormatWhenRenaming?: boolean | null;
            name?: string | null;
            specifications?: components["schemas"]["CustomFormatSpecificationSchema"][] | null;
        };
        CustomFormatSpecificationSchema: {
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            infoLink?: string | null;
            name?: string | null;
            negate?: boolean;
            presets?: components["schemas"]["CustomFormatSpecificationSchema"][] | null;
            required?: boolean;
        };
        /** @enum {string} */
        DatabaseType: "sqLite" | "postgreSQL";
        DelayProfileResource: {
            bypassIfAboveCustomFormatScore?: boolean;
            bypassIfHighestQuality?: boolean;
            enableTorrent?: boolean;
            enableUsenet?: boolean;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            minimumCustomFormatScore?: number;
            /** Format: int32 */
            order?: number;
            preferredProtocol?: components["schemas"]["DownloadProtocol"];
            tags?: number[] | null;
            /** Format: int32 */
            torrentDelay?: number;
            /** Format: int32 */
            usenetDelay?: number;
        };
        DiskSpaceResource: {
            /** Format: int64 */
            freeSpace?: number;
            /** Format: int32 */
            id?: number;
            label?: string | null;
            path?: string | null;
            /** Format: int64 */
            totalSpace?: number;
        };
        DownloadClientBulkResource: {
            applyTags?: components["schemas"]["ApplyTags"];
            enable?: boolean | null;
            ids?: number[] | null;
            /** Format: int32 */
            priority?: number | null;
            removeCompletedDownloads?: boolean | null;
            removeFailedDownloads?: boolean | null;
            tags?: number[] | null;
        };
        DownloadClientConfigResource: {
            autoRedownloadFailed?: boolean;
            autoRedownloadFailedFromInteractiveSearch?: boolean;
            /** Format: int32 */
            checkForFinishedDownloadInterval?: number;
            downloadClientWorkingFolders?: string | null;
            enableCompletedDownloadHandling?: boolean;
            /** Format: int32 */
            id?: number;
        };
        DownloadClientResource: {
            configContract?: string | null;
            enable?: boolean;
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            infoLink?: string | null;
            message?: components["schemas"]["ProviderMessage"];
            name?: string | null;
            presets?: components["schemas"]["DownloadClientResource"][] | null;
            /** Format: int32 */
            priority?: number;
            protocol?: components["schemas"]["DownloadProtocol"];
            removeCompletedDownloads?: boolean;
            removeFailedDownloads?: boolean;
            tags?: number[] | null;
        };
        /** @enum {string} */
        DownloadProtocol: "unknown" | "usenet" | "torrent";
        ExtraFileResource: {
            extension?: string | null;
            /** Format: int32 */
            id?: number;
            languageTags?: string[] | null;
            /** Format: int32 */
            movieFileId?: number | null;
            /** Format: int32 */
            movieId?: number;
            relativePath?: string | null;
            title?: string | null;
            type?: components["schemas"]["ExtraFileType"];
        };
        /** @enum {string} */
        ExtraFileType: "subtitle" | "metadata" | "other";
        Field: {
            advanced?: boolean;
            helpLink?: string | null;
            helpText?: string | null;
            helpTextWarning?: string | null;
            hidden?: string | null;
            isFloat?: boolean;
            label?: string | null;
            name?: string | null;
            /** Format: int32 */
            order?: number;
            placeholder?: string | null;
            privacy?: components["schemas"]["PrivacyLevel"];
            section?: string | null;
            selectOptions?: components["schemas"]["SelectOption"][] | null;
            selectOptionsProviderAction?: string | null;
            type?: string | null;
            unit?: string | null;
            value?: unknown;
        };
        /** @enum {string} */
        FileDateType: "none" | "cinemas" | "release";
        /** @enum {string} */
        FileSystemEntityType: "parent" | "drive" | "folder" | "file";
        FileSystemMediaFileResource: {
            name?: string | null;
            path?: string | null;
            relativePath?: string | null;
        };
        FileSystemModel: {
            extension?: string | null;
            /** Format: date-time */
            lastModified?: string | null;
            name?: string | null;
            path?: string | null;
            /** Format: int64 */
            size?: number;
            type?: components["schemas"]["FileSystemEntityType"];
        };
        FileSystemResult: {
            directories?: components["schemas"]["FileSystemModel"][] | null;
            files?: components["schemas"]["FileSystemModel"][] | null;
            parent?: string | null;
        };
        FileSystemTypeResource: {
            type?: components["schemas"]["FileSystemEntityType"];
        };
        /** @enum {string} */
        HealthCheckResult: "ok" | "notice" | "warning" | "error";
        HealthResource: {
            /** Format: int32 */
            id?: number;
            message?: string | null;
            source?: string | null;
            type?: components["schemas"]["HealthCheckResult"];
            wikiUrl?: string | null;
        };
        HistoryResource: {
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number;
            data?: {
                [key: string]: string | null;
            } | null;
            /** Format: date-time */
            date?: string;
            downloadId?: string | null;
            eventType?: components["schemas"]["MovieHistoryEventType"];
            /** Format: int32 */
            id?: number;
            languages?: components["schemas"]["Language"][] | null;
            movie?: components["schemas"]["MovieResource"];
            /** Format: int32 */
            movieId?: number;
            quality?: components["schemas"]["QualityModel"];
            qualityCutoffNotMet?: boolean;
            sourceTitle?: string | null;
        };
        HistoryResourcePagingResource: {
            /** Format: int32 */
            page?: number;
            /** Format: int32 */
            pageSize?: number;
            records?: components["schemas"]["HistoryResource"][] | null;
            sortDirection?: components["schemas"]["SortDirection"];
            sortKey?: string | null;
            /** Format: int32 */
            totalRecords?: number;
        };
        HostConfigResource: {
            allowedHosts?: string | null;
            analyticsEnabled?: boolean;
            apiKey?: string | null;
            applicationUrl?: string | null;
            authenticationMethod?: components["schemas"]["AuthenticationType"];
            authenticationRequired?: components["schemas"]["AuthenticationRequiredType"];
            backupFolder?: string | null;
            /** Format: int32 */
            backupInterval?: number;
            /** Format: int32 */
            backupRetention?: number;
            bindAddress?: string | null;
            branch?: string | null;
            certificateValidation?: components["schemas"]["CertificateValidationType"];
            consoleLogLevel?: string | null;
            enableSsl?: boolean;
            /** Format: int32 */
            id?: number;
            instanceName?: string | null;
            launchBrowser?: boolean;
            logLevel?: string | null;
            /** Format: int32 */
            logSizeLimit?: number;
            oidcAuthority?: string | null;
            oidcClientId?: string | null;
            oidcClientSecret?: string | null;
            oidcScopes?: string | null;
            oidcUserIdentifier?: string | null;
            password?: string | null;
            passwordConfirmation?: string | null;
            /** Format: int32 */
            port?: number;
            proxyBypassFilter?: string | null;
            proxyBypassLocalAddresses?: boolean;
            proxyEnabled?: boolean;
            proxyHostname?: string | null;
            proxyPassword?: string | null;
            /** Format: int32 */
            proxyPort?: number;
            proxyType?: components["schemas"]["ProxyType"];
            proxyUsername?: string | null;
            sslCertPassword?: string | null;
            sslCertPath?: string | null;
            sslKeyPath?: string | null;
            /** Format: int32 */
            sslPort?: number;
            trustCgnatIpAddresses?: boolean;
            trustedNetworks?: string | null;
            updateAutomatically?: boolean;
            updateMechanism?: components["schemas"]["UpdateMechanism"];
            updateScriptPath?: string | null;
            urlBase?: string | null;
            username?: string | null;
        };
        ImportListBulkResource: {
            applyTags?: components["schemas"]["ApplyTags"];
            enableAuto?: boolean | null;
            enabled?: boolean | null;
            ids?: number[] | null;
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            /** Format: int32 */
            qualityProfileId?: number | null;
            rootFolderPath?: string | null;
            tags?: number[] | null;
        };
        ImportListConfigResource: {
            /** Format: int32 */
            id?: number;
            listSyncLevel?: string | null;
        };
        ImportListExclusionBulkResource: {
            ids?: number[] | null;
        };
        ImportListExclusionResource: {
            configContract?: string | null;
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            infoLink?: string | null;
            message?: components["schemas"]["ProviderMessage"];
            movieTitle?: string | null;
            /** Format: int32 */
            movieYear?: number;
            name?: string | null;
            presets?: components["schemas"]["ImportListExclusionResource"][] | null;
            tags?: number[] | null;
            /** Format: int32 */
            tmdbId?: number;
        };
        ImportListExclusionResourcePagingResource: {
            /** Format: int32 */
            page?: number;
            /** Format: int32 */
            pageSize?: number;
            records?: components["schemas"]["ImportListExclusionResource"][] | null;
            sortDirection?: components["schemas"]["SortDirection"];
            sortKey?: string | null;
            /** Format: int32 */
            totalRecords?: number;
        };
        ImportListMoviesResource: {
            certification?: string | null;
            collection?: components["schemas"]["MovieCollection"];
            /** Format: date-time */
            digitalRelease?: string | null;
            folder?: string | null;
            genres?: string[] | null;
            /** Format: int32 */
            id?: number;
            images?: components["schemas"]["MediaCover"][] | null;
            imdbId?: string | null;
            /** Format: date-time */
            inCinemas?: string | null;
            isExcluded?: boolean;
            isExisting?: boolean;
            isPopular?: boolean;
            isRecommendation?: boolean;
            isTrending?: boolean;
            lists?: number[] | null;
            originalLanguage?: components["schemas"]["Language"];
            overview?: string | null;
            /** Format: date-time */
            physicalRelease?: string | null;
            /** Format: float */
            popularity?: number;
            ratings?: components["schemas"]["Ratings"];
            remotePoster?: string | null;
            /** Format: int32 */
            runtime?: number;
            sortTitle?: string | null;
            status?: components["schemas"]["MovieStatusType"];
            studio?: string | null;
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
            website?: string | null;
            /** Format: int32 */
            year?: number;
            youTubeTrailerId?: string | null;
        };
        ImportListResource: {
            configContract?: string | null;
            enableAuto?: boolean;
            enabled?: boolean;
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            infoLink?: string | null;
            /** Format: int32 */
            listOrder?: number;
            listType?: components["schemas"]["ImportListType"];
            message?: components["schemas"]["ProviderMessage"];
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            /** Format: date-span */
            minRefreshInterval?: string;
            monitor?: components["schemas"]["MonitorTypes"];
            name?: string | null;
            presets?: components["schemas"]["ImportListResource"][] | null;
            /** Format: int32 */
            qualityProfileId?: number;
            rootFolderPath?: string | null;
            searchOnAdd?: boolean;
            tags?: number[] | null;
        };
        /** @enum {string} */
        ImportListType: "program" | "tmdb" | "trakt" | "plex" | "simkl" | "other" | "advanced";
        ImportRejectionResource: {
            reason?: string | null;
            type?: components["schemas"]["RejectionType"];
        };
        IndexerBulkResource: {
            applyTags?: components["schemas"]["ApplyTags"];
            enableAutomaticSearch?: boolean | null;
            enableInteractiveSearch?: boolean | null;
            enableRss?: boolean | null;
            ids?: number[] | null;
            /** Format: int32 */
            priority?: number | null;
            tags?: number[] | null;
        };
        IndexerConfigResource: {
            allowHardcodedSubs?: boolean;
            /** Format: int32 */
            availabilityDelay?: number;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            maximumSize?: number;
            /** Format: int32 */
            minimumAge?: number;
            preferIndexerFlags?: boolean;
            /** Format: int32 */
            retention?: number;
            /** Format: int32 */
            rssSyncInterval?: number;
            whitelistedHardcodedSubs?: string | null;
        };
        IndexerFlagResource: {
            /** Format: int32 */
            id?: number;
            name?: string | null;
            readonly nameLower?: string | null;
        };
        IndexerResource: {
            configContract?: string | null;
            /** Format: int32 */
            downloadClientId?: number;
            enableAutomaticSearch?: boolean;
            enableInteractiveSearch?: boolean;
            enableRss?: boolean;
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            infoLink?: string | null;
            message?: components["schemas"]["ProviderMessage"];
            name?: string | null;
            presets?: components["schemas"]["IndexerResource"][] | null;
            /** Format: int32 */
            priority?: number;
            protocol?: components["schemas"]["DownloadProtocol"];
            supportsRss?: boolean;
            supportsSearch?: boolean;
            tags?: number[] | null;
        };
        Language: {
            /** Format: int32 */
            id?: number;
            name?: string | null;
        };
        LanguageResource: {
            /** Format: int32 */
            id?: number;
            name?: string | null;
            readonly nameLower?: string | null;
        };
        LocalizationLanguageResource: {
            identifier?: string | null;
        };
        LogFileResource: {
            contentsUrl?: string | null;
            downloadUrl?: string | null;
            filename?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: date-time */
            lastWriteTime?: string;
        };
        LogResource: {
            exception?: string | null;
            exceptionType?: string | null;
            /** Format: int32 */
            id?: number;
            level?: string | null;
            logger?: string | null;
            message?: string | null;
            method?: string | null;
            /** Format: date-time */
            time?: string;
        };
        LogResourcePagingResource: {
            /** Format: int32 */
            page?: number;
            /** Format: int32 */
            pageSize?: number;
            records?: components["schemas"]["LogResource"][] | null;
            sortDirection?: components["schemas"]["SortDirection"];
            sortKey?: string | null;
            /** Format: int32 */
            totalRecords?: number;
        };
        ManualImportReprocessResource: {
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number;
            downloadId?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            indexerFlags?: number;
            languages?: components["schemas"]["Language"][] | null;
            movie?: components["schemas"]["MovieResource"];
            /** Format: int32 */
            movieId?: number;
            path?: string | null;
            quality?: components["schemas"]["QualityModel"];
            rejections?: components["schemas"]["ImportRejectionResource"][] | null;
            releaseGroup?: string | null;
        };
        ManualImportResource: {
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number;
            downloadId?: string | null;
            folderName?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            indexerFlags?: number;
            languages?: components["schemas"]["Language"][] | null;
            movie?: components["schemas"]["MovieResource"];
            /** Format: int32 */
            movieFileId?: number | null;
            name?: string | null;
            path?: string | null;
            quality?: components["schemas"]["QualityModel"];
            /** Format: int32 */
            qualityWeight?: number;
            rejections?: components["schemas"]["ImportRejectionResource"][] | null;
            relativePath?: string | null;
            releaseGroup?: string | null;
            /** Format: int64 */
            size?: number;
        };
        MediaCover: {
            coverType?: components["schemas"]["MediaCoverTypes"];
            remoteUrl?: string | null;
            url?: string | null;
        };
        /** @enum {string} */
        MediaCoverTypes: "unknown" | "poster" | "banner" | "fanart" | "screenshot" | "headshot" | "clearlogo";
        MediaInfoResource: {
            /** Format: int64 */
            audioBitrate?: number;
            /** Format: double */
            audioChannels?: number;
            audioCodec?: string | null;
            audioLanguages?: string | null;
            /** Format: int32 */
            audioStreamCount?: number;
            /** Format: int32 */
            id?: number;
            resolution?: string | null;
            runTime?: string | null;
            scanType?: string | null;
            subtitles?: string | null;
            /** Format: int32 */
            videoBitDepth?: number;
            /** Format: int64 */
            videoBitrate?: number;
            videoCodec?: string | null;
            videoDynamicRange?: string | null;
            videoDynamicRangeType?: string | null;
            /** Format: double */
            videoFps?: number;
        };
        MediaManagementConfigResource: {
            autoRenameFolders?: boolean;
            autoUnmonitorPreviouslyDownloadedMovies?: boolean;
            chmodFolder?: string | null;
            chownGroup?: string | null;
            copyUsingHardlinks?: boolean;
            createEmptyMovieFolders?: boolean;
            deleteEmptyFolders?: boolean;
            downloadPropersAndRepacks?: components["schemas"]["ProperDownloadTypes"];
            enableMediaInfo?: boolean;
            extraFileExtensions?: string | null;
            fileDate?: components["schemas"]["FileDateType"];
            /** Format: int32 */
            id?: number;
            importExtraFiles?: boolean;
            /** Format: int32 */
            minimumFreeSpaceWhenImporting?: number;
            pathsDefaultStatic?: boolean;
            recycleBin?: string | null;
            /** Format: int32 */
            recycleBinCleanupDays?: number;
            rescanAfterRefresh?: components["schemas"]["RescanAfterRefreshType"];
            scriptImportPath?: string | null;
            setPermissionsLinux?: boolean;
            skipFreeSpaceCheckWhenImporting?: boolean;
            useScriptImport?: boolean;
        };
        MetadataConfigResource: {
            certificationCountry?: components["schemas"]["TMDbCountryCode"];
            /** Format: int32 */
            id?: number;
        };
        MetadataResource: {
            configContract?: string | null;
            enable?: boolean;
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            infoLink?: string | null;
            message?: components["schemas"]["ProviderMessage"];
            name?: string | null;
            presets?: components["schemas"]["MetadataResource"][] | null;
            tags?: number[] | null;
        };
        /** @enum {string} */
        Modifier: "none" | "regional" | "screener" | "rawhd" | "brdisk" | "remux";
        /** @enum {string} */
        MonitorTypes: "movieOnly" | "movieAndCollection" | "none";
        MovieCollection: {
            /** Format: date-time */
            added?: string;
            cleanTitle?: string | null;
            /** Format: int32 */
            id?: number;
            images?: components["schemas"]["MediaCover"][] | null;
            /** Format: date-time */
            lastInfoSync?: string | null;
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            monitored?: boolean;
            movies?: components["schemas"]["MovieMetadata"][] | null;
            overview?: string | null;
            /** Format: int32 */
            qualityProfileId?: number;
            rootFolderPath?: string | null;
            searchOnAdd?: boolean;
            sortTitle?: string | null;
            tags?: number[] | null;
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
        };
        MovieCollectionResource: {
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
        };
        MovieEditorResource: {
            addImportExclusion?: boolean;
            applyTags?: components["schemas"]["ApplyTags"];
            deleteFiles?: boolean;
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            monitored?: boolean | null;
            moveFiles?: boolean;
            movieIds?: number[] | null;
            /** Format: int32 */
            qualityProfileId?: number | null;
            rootFolderPath?: string | null;
            tags?: number[] | null;
        };
        MovieFileListResource: {
            edition?: string | null;
            /** Format: int32 */
            indexerFlags?: number | null;
            languages?: components["schemas"]["Language"][] | null;
            movieFileIds?: number[] | null;
            quality?: components["schemas"]["QualityModel"];
            releaseGroup?: string | null;
            sceneName?: string | null;
        };
        MovieFileResource: {
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number | null;
            /** Format: date-time */
            dateAdded?: string;
            edition?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            indexerFlags?: number | null;
            languages?: components["schemas"]["Language"][] | null;
            mediaInfo?: components["schemas"]["MediaInfoResource"];
            /** Format: int32 */
            movieId?: number;
            originalFilePath?: string | null;
            path?: string | null;
            quality?: components["schemas"]["QualityModel"];
            qualityCutoffNotMet?: boolean;
            relativePath?: string | null;
            releaseGroup?: string | null;
            sceneName?: string | null;
            /** Format: int64 */
            size?: number;
        };
        MovieFolderResource: {
            folder?: string | null;
        };
        /** @enum {string} */
        MovieHistoryEventType: "unknown" | "grabbed" | "downloadFolderImported" | "downloadFailed" | "movieFileDeleted" | "movieFolderImported" | "movieFileRenamed" | "downloadIgnored";
        MovieMetadata: {
            alternativeTitles?: components["schemas"]["AlternativeTitle"][] | null;
            certification?: string | null;
            cleanOriginalTitle?: string | null;
            cleanTitle?: string | null;
            collectionTitle?: string | null;
            /** Format: int32 */
            collectionTmdbId?: number;
            /** Format: date-time */
            digitalRelease?: string | null;
            genres?: string[] | null;
            /** Format: int32 */
            id?: number;
            images?: components["schemas"]["MediaCover"][] | null;
            imdbId?: string | null;
            /** Format: date-time */
            inCinemas?: string | null;
            readonly isRecentMovie?: boolean;
            keywords?: string[] | null;
            /** Format: date-time */
            lastInfoSync?: string | null;
            originalLanguage?: components["schemas"]["Language"];
            originalTitle?: string | null;
            overview?: string | null;
            /** Format: date-time */
            physicalRelease?: string | null;
            /** Format: float */
            popularity?: number;
            ratings?: components["schemas"]["Ratings"];
            recommendations?: number[] | null;
            /** Format: int32 */
            runtime?: number;
            /** Format: int32 */
            secondaryYear?: number | null;
            sortTitle?: string | null;
            status?: components["schemas"]["MovieStatusType"];
            studio?: string | null;
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
            translations?: components["schemas"]["MovieTranslation"][] | null;
            website?: string | null;
            /** Format: int32 */
            year?: number;
            youTubeTrailerId?: string | null;
        };
        MovieResource: {
            /** Format: date-time */
            added?: string;
            addOptions?: components["schemas"]["AddMovieOptions"];
            alternateTitles?: components["schemas"]["AlternativeTitleResource"][] | null;
            certification?: string | null;
            cleanTitle?: string | null;
            collection?: components["schemas"]["MovieCollectionResource"];
            /** Format: date-time */
            digitalRelease?: string | null;
            folder?: string | null;
            folderName?: string | null;
            genres?: string[] | null;
            hasFile?: boolean | null;
            /** Format: int32 */
            id?: number;
            images?: components["schemas"]["MediaCover"][] | null;
            imdbId?: string | null;
            /** Format: date-time */
            inCinemas?: string | null;
            isAvailable?: boolean;
            keywords?: string[] | null;
            /** Format: date-time */
            lastSearchTime?: string | null;
            minimumAvailability?: components["schemas"]["MovieStatusType"];
            monitored?: boolean;
            movieFile?: components["schemas"]["MovieFileResource"];
            /** Format: int32 */
            movieFileId?: number;
            originalLanguage?: components["schemas"]["Language"];
            originalTitle?: string | null;
            overview?: string | null;
            path?: string | null;
            /** Format: date-time */
            physicalRelease?: string | null;
            physicalReleaseNote?: string | null;
            /** Format: float */
            popularity?: number;
            /** Format: int32 */
            qualityProfileId?: number;
            ratings?: components["schemas"]["Ratings"];
            /** Format: date-time */
            releaseDate?: string | null;
            remotePoster?: string | null;
            rootFolderPath?: string | null;
            /** Format: int32 */
            runtime?: number;
            /** Format: int32 */
            secondaryYear?: number | null;
            /** Format: int32 */
            secondaryYearSourceId?: number;
            /** Format: int64 */
            sizeOnDisk?: number | null;
            sortTitle?: string | null;
            statistics?: components["schemas"]["MovieStatisticsResource"];
            status?: components["schemas"]["MovieStatusType"];
            studio?: string | null;
            tags?: number[] | null;
            title?: string | null;
            titleSlug?: string | null;
            /** Format: int32 */
            tmdbId?: number;
            website?: string | null;
            /** Format: int32 */
            year?: number;
            youTubeTrailerId?: string | null;
        };
        MovieResourcePagingResource: {
            /** Format: int32 */
            page?: number;
            /** Format: int32 */
            pageSize?: number;
            records?: components["schemas"]["MovieResource"][] | null;
            sortDirection?: components["schemas"]["SortDirection"];
            sortKey?: string | null;
            /** Format: int32 */
            totalRecords?: number;
        };
        /** @enum {string} */
        MovieRuntimeFormatType: "hoursMinutes" | "minutes";
        MovieStatisticsResource: {
            /** Format: int32 */
            movieFileCount?: number;
            movieFileQualities?: components["schemas"]["Quality"][] | null;
            releaseGroups?: string[] | null;
            /** Format: int64 */
            sizeOnDisk?: number;
        };
        /** @enum {string} */
        MovieStatusType: "tba" | "announced" | "inCinemas" | "released" | "deleted";
        MovieTranslation: {
            cleanTitle?: string | null;
            /** Format: int32 */
            id?: number;
            language?: components["schemas"]["Language"];
            /** Format: int32 */
            movieMetadataId?: number;
            overview?: string | null;
            title?: string | null;
        };
        NamingConfigResource: {
            colonReplacementFormat?: components["schemas"]["ColonReplacementFormat"];
            /** Format: int32 */
            id?: number;
            movieFolderFormat?: string | null;
            renameMovies?: boolean;
            replaceIllegalCharacters?: boolean;
            standardMovieFormat?: string | null;
        };
        NamingExampleResource: {
            movieExample?: string | null;
            movieFolderExample?: string | null;
        };
        NotificationResource: {
            configContract?: string | null;
            fields?: components["schemas"]["Field"][] | null;
            /** Format: int32 */
            id?: number;
            implementation?: string | null;
            implementationName?: string | null;
            includeHealthWarnings?: boolean;
            infoLink?: string | null;
            link?: string | null;
            message?: components["schemas"]["ProviderMessage"];
            name?: string | null;
            onApplicationUpdate?: boolean;
            onDownload?: boolean;
            onGrab?: boolean;
            onHealthIssue?: boolean;
            onHealthRestored?: boolean;
            onManualInteractionRequired?: boolean;
            onMovieAdded?: boolean;
            onMovieDelete?: boolean;
            onMovieFileDelete?: boolean;
            onMovieFileDeleteForUpgrade?: boolean;
            onRename?: boolean;
            onUpgrade?: boolean;
            presets?: components["schemas"]["NotificationResource"][] | null;
            supportsOnApplicationUpdate?: boolean;
            supportsOnDownload?: boolean;
            supportsOnGrab?: boolean;
            supportsOnHealthIssue?: boolean;
            supportsOnHealthRestored?: boolean;
            supportsOnManualInteractionRequired?: boolean;
            supportsOnMovieAdded?: boolean;
            supportsOnMovieDelete?: boolean;
            supportsOnMovieFileDelete?: boolean;
            supportsOnMovieFileDeleteForUpgrade?: boolean;
            supportsOnRename?: boolean;
            supportsOnUpgrade?: boolean;
            tags?: number[] | null;
            testCommand?: string | null;
        };
        ParsedMovieInfo: {
            edition?: string | null;
            hardcodedSubs?: string | null;
            imdbId?: string | null;
            languages?: components["schemas"]["Language"][] | null;
            readonly movieTitle?: string | null;
            movieTitles?: string[] | null;
            originalTitle?: string | null;
            readonly primaryMovieTitle?: string | null;
            quality?: components["schemas"]["QualityModel"];
            releaseGroup?: string | null;
            releaseHash?: string | null;
            releaseTitle?: string | null;
            simpleReleaseTitle?: string | null;
            /** Format: int32 */
            tmdbId?: number;
            /** Format: int32 */
            year?: number;
        };
        ParseResource: {
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number;
            /** Format: int32 */
            id?: number;
            languages?: components["schemas"]["Language"][] | null;
            movie?: components["schemas"]["MovieResource"];
            parsedMovieInfo?: components["schemas"]["ParsedMovieInfo"];
            title?: string | null;
        };
        PingResource: {
            status?: string | null;
        };
        /** @enum {string} */
        PrivacyLevel: "normal" | "password" | "apiKey" | "userName";
        ProblemDetails: {
            detail?: string | null;
            instance?: string | null;
            /** Format: int32 */
            status?: number | null;
            title?: string | null;
            type?: string | null;
        } & {
            [key: string]: unknown;
        };
        ProfileFormatItemResource: {
            /** Format: int32 */
            format?: number;
            /** Format: int32 */
            id?: number;
            name?: string | null;
            /** Format: int32 */
            score?: number;
        };
        /** @enum {string} */
        ProperDownloadTypes: "preferAndUpgrade" | "doNotUpgrade" | "doNotPrefer";
        ProviderMessage: {
            message?: string | null;
            type?: components["schemas"]["ProviderMessageType"];
        };
        /** @enum {string} */
        ProviderMessageType: "info" | "warning" | "error";
        ProviderTestAllResult: {
            /** Format: int32 */
            id?: number;
            readonly isValid?: boolean;
            validationFailures?: components["schemas"]["ValidationFailure"][] | null;
        };
        /** @enum {string} */
        ProxyType: "http" | "socks4" | "socks5";
        Quality: {
            /** Format: int32 */
            id?: number;
            modifier?: components["schemas"]["Modifier"];
            name?: string | null;
            /** Format: int32 */
            resolution?: number;
            source?: components["schemas"]["QualitySource"];
        };
        QualityDefinitionLimitsResource: {
            /** Format: int32 */
            max?: number;
            /** Format: int32 */
            min?: number;
        };
        QualityDefinitionResource: {
            /** Format: int32 */
            id?: number;
            /** Format: double */
            maxSize?: number | null;
            /** Format: double */
            minSize?: number | null;
            /** Format: double */
            preferredSize?: number | null;
            quality?: components["schemas"]["Quality"];
            title?: string | null;
            /** Format: int32 */
            weight?: number;
        };
        QualityModel: {
            quality?: components["schemas"]["Quality"];
            revision?: components["schemas"]["Revision"];
        };
        QualityProfileQualityItemResource: {
            allowed?: boolean;
            /** Format: int32 */
            id?: number;
            items?: components["schemas"]["QualityProfileQualityItemResource"][] | null;
            name?: string | null;
            quality?: components["schemas"]["Quality"];
        };
        QualityProfileResource: {
            /** Format: int32 */
            cutoff?: number;
            /** Format: int32 */
            cutoffFormatScore?: number;
            formatItems?: components["schemas"]["ProfileFormatItemResource"][] | null;
            /** Format: int32 */
            id?: number;
            items?: components["schemas"]["QualityProfileQualityItemResource"][] | null;
            language?: components["schemas"]["Language"];
            /** Format: int32 */
            minFormatScore?: number;
            /** Format: int32 */
            minUpgradeFormatScore?: number;
            name?: string | null;
            upgradeAllowed?: boolean;
        };
        /** @enum {string} */
        QualitySource: "unknown" | "cam" | "telesync" | "telecine" | "workprint" | "dvd" | "tv" | "webdl" | "webrip" | "bluray";
        QueueBulkResource: {
            ids?: number[] | null;
        };
        QueueResource: {
            /** Format: date-time */
            added?: string | null;
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number;
            downloadClient?: string | null;
            downloadClientHasPostImportCategory?: boolean;
            downloadId?: string | null;
            errorMessage?: string | null;
            /** Format: date-time */
            estimatedCompletionTime?: string | null;
            /** Format: int32 */
            id?: number;
            indexer?: string | null;
            languages?: components["schemas"]["Language"][] | null;
            movie?: components["schemas"]["MovieResource"];
            /** Format: int32 */
            movieId?: number | null;
            outputPath?: string | null;
            protocol?: components["schemas"]["DownloadProtocol"];
            quality?: components["schemas"]["QualityModel"];
            /** Format: double */
            size?: number;
            /**
             * Format: double
             * @deprecated
             */
            sizeleft?: number;
            status?: components["schemas"]["QueueStatus"];
            statusMessages?: components["schemas"]["TrackedDownloadStatusMessage"][] | null;
            /**
             * Format: date-span
             * @deprecated
             */
            timeleft?: string | null;
            title?: string | null;
            trackedDownloadState?: components["schemas"]["TrackedDownloadState"];
            trackedDownloadStatus?: components["schemas"]["TrackedDownloadStatus"];
        };
        QueueResourcePagingResource: {
            /** Format: int32 */
            page?: number;
            /** Format: int32 */
            pageSize?: number;
            records?: components["schemas"]["QueueResource"][] | null;
            sortDirection?: components["schemas"]["SortDirection"];
            sortKey?: string | null;
            /** Format: int32 */
            totalRecords?: number;
        };
        /** @enum {string} */
        QueueStatus: "unknown" | "queued" | "paused" | "downloading" | "completed" | "failed" | "warning" | "delay" | "downloadClientUnavailable" | "fallback";
        QueueStatusResource: {
            /** Format: int32 */
            count?: number;
            errors?: boolean;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            totalCount?: number;
            /** Format: int32 */
            unknownCount?: number;
            unknownErrors?: boolean;
            unknownWarnings?: boolean;
            warnings?: boolean;
        };
        RatingChild: {
            type?: components["schemas"]["RatingType"];
            /** Format: double */
            value?: number;
            /** Format: int32 */
            votes?: number;
        };
        Ratings: {
            imdb?: components["schemas"]["RatingChild"];
            metacritic?: components["schemas"]["RatingChild"];
            rottenTomatoes?: components["schemas"]["RatingChild"];
            tmdb?: components["schemas"]["RatingChild"];
            trakt?: components["schemas"]["RatingChild"];
        };
        /** @enum {string} */
        RatingType: "user" | "critic";
        /** @enum {string} */
        RejectionType: "permanent" | "temporary";
        ReleaseHistoryResource: {
            /** Format: date-time */
            failed?: string | null;
            /** Format: date-time */
            grabbed?: string | null;
        };
        ReleaseProfileResource: {
            enabled?: boolean;
            /** Format: int32 */
            id?: number;
            ignored?: unknown;
            /** Format: int32 */
            indexerId?: number;
            name?: string | null;
            required?: unknown;
            tags?: number[] | null;
        };
        ReleaseResource: {
            /** Format: int32 */
            age?: number;
            /** Format: double */
            ageHours?: number;
            /** Format: double */
            ageMinutes?: number;
            approved?: boolean;
            commentUrl?: string | null;
            customFormats?: components["schemas"]["CustomFormatResource"][] | null;
            /** Format: int32 */
            customFormatScore?: number;
            downloadAllowed?: boolean;
            downloadClient?: string | null;
            /** Format: int32 */
            downloadClientId?: number | null;
            downloadUrl?: string | null;
            edition?: string | null;
            guid?: string | null;
            history?: components["schemas"]["ReleaseHistoryResource"];
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            imdbId?: number;
            indexer?: string | null;
            indexerFlags?: unknown;
            /** Format: int32 */
            indexerId?: number;
            infoHash?: string | null;
            infoUrl?: string | null;
            languages?: components["schemas"]["Language"][] | null;
            /** Format: int32 */
            leechers?: number | null;
            magnetUrl?: string | null;
            /** Format: int32 */
            mappedMovieId?: number | null;
            /** Format: int32 */
            movieId?: number | null;
            movieRequested?: boolean;
            movieTitles?: string[] | null;
            protocol?: components["schemas"]["DownloadProtocol"];
            /** Format: date-time */
            publishDate?: string;
            quality?: components["schemas"]["QualityModel"];
            /** Format: int32 */
            qualityWeight?: number;
            rejected?: boolean;
            rejections?: string[] | null;
            releaseGroup?: string | null;
            releaseHash?: string | null;
            /** Format: int32 */
            releaseWeight?: number;
            sceneSource?: boolean;
            /** Format: int32 */
            seeders?: number | null;
            shouldOverride?: boolean | null;
            /** Format: int64 */
            size?: number;
            subGroup?: string | null;
            temporarilyRejected?: boolean;
            title?: string | null;
            /** Format: int32 */
            tmdbId?: number;
        };
        RemotePathMappingResource: {
            host?: string | null;
            /** Format: int32 */
            id?: number;
            localPath?: string | null;
            remotePath?: string | null;
        };
        RenameMovieResource: {
            existingPath?: string | null;
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            movieFileId?: number;
            /** Format: int32 */
            movieId?: number;
            newPath?: string | null;
        };
        /** @enum {string} */
        RescanAfterRefreshType: "always" | "afterManual" | "never";
        Revision: {
            isRepack?: boolean;
            /** Format: int32 */
            real?: number;
            /** Format: int32 */
            version?: number;
        };
        RootFolderResource: {
            accessible?: boolean;
            /** Format: int64 */
            freeSpace?: number | null;
            /** Format: int32 */
            id?: number;
            path?: string | null;
            unmappedFolders?: components["schemas"]["UnmappedFolder"][] | null;
        };
        /** @enum {string} */
        RuntimeMode: "console" | "service" | "tray";
        SelectOption: {
            dividerAfter?: boolean;
            hint?: string | null;
            name?: string | null;
            /** Format: int32 */
            order?: number;
            /** Format: int32 */
            value?: number;
        };
        /** @enum {string} */
        Severity: "error" | "warning" | "info";
        /** @enum {string} */
        SortDirection: "default" | "ascending" | "descending";
        /** @enum {string} */
        SourceType: "tmdb" | "mappings" | "user" | "indexer";
        SystemResource: {
            appData?: string | null;
            appName?: string | null;
            authentication?: components["schemas"]["AuthenticationType"];
            branch?: string | null;
            /** Format: date-time */
            buildTime?: string;
            databaseType?: components["schemas"]["DatabaseType"];
            databaseVersion?: string | null;
            instanceName?: string | null;
            isAdmin?: boolean;
            isContainerized?: boolean;
            isDebug?: boolean;
            isDocker?: boolean;
            isLinux?: boolean;
            isNetCore?: boolean;
            isOsx?: boolean;
            isProduction?: boolean;
            isUserInteractive?: boolean;
            isWindows?: boolean;
            /** Format: int32 */
            migrationVersion?: number;
            mode?: components["schemas"]["RuntimeMode"];
            osName?: string | null;
            osVersion?: string | null;
            packageAuthor?: string | null;
            packageUpdateMechanism?: components["schemas"]["UpdateMechanism"];
            packageUpdateMechanismMessage?: string | null;
            packageVersion?: string | null;
            runtimeName?: string | null;
            runtimeVersion?: string | null;
            /** Format: date-time */
            startTime?: string;
            startupPath?: string | null;
            urlBase?: string | null;
            version?: string | null;
        };
        SystemRestartResource: {
            restarting?: boolean;
        };
        SystemShutdownResource: {
            shuttingDown?: boolean;
        };
        TagDetailsResource: {
            autoTagIds?: number[] | null;
            delayProfileIds?: number[] | null;
            downloadClientIds?: number[] | null;
            /** Format: int32 */
            id?: number;
            importListIds?: number[] | null;
            indexerIds?: number[] | null;
            label?: string | null;
            movieIds?: number[] | null;
            notificationIds?: number[] | null;
            releaseProfileIds?: number[] | null;
        };
        TagResource: {
            /** Format: int32 */
            id?: number;
            label?: string | null;
        };
        TaskResource: {
            /** Format: int32 */
            id?: number;
            /** Format: int32 */
            interval?: number;
            /** Format: date-span */
            readonly lastDuration?: string;
            /** Format: date-time */
            lastExecution?: string;
            /** Format: date-time */
            lastStartTime?: string;
            name?: string | null;
            /** Format: date-time */
            nextExecution?: string;
            taskName?: string | null;
        };
        /** @enum {string} */
        TMDbCountryCode: "au" | "br" | "ca" | "fr" | "de" | "gb" | "in" | "ie" | "it" | "nz" | "ro" | "es" | "us";
        /** @enum {string} */
        TrackedDownloadState: "downloading" | "importBlocked" | "importPending" | "importing" | "imported" | "failedPending" | "failed" | "ignored";
        /** @enum {string} */
        TrackedDownloadStatus: "ok" | "warning" | "error";
        TrackedDownloadStatusMessage: {
            messages?: string[] | null;
            title?: string | null;
        };
        UiConfigResource: {
            calendarWeekColumnHeader?: string | null;
            enableColorImpairedMode?: boolean;
            /** Format: int32 */
            firstDayOfWeek?: number;
            /** Format: int32 */
            id?: number;
            longDateFormat?: string | null;
            /** Format: int32 */
            movieInfoLanguage?: number;
            movieRuntimeFormat?: components["schemas"]["MovieRuntimeFormatType"];
            shortDateFormat?: string | null;
            showRelativeDates?: boolean;
            theme?: string | null;
            timeFormat?: string | null;
            /** Format: int32 */
            uiLanguage?: number;
        };
        UnmappedFolder: {
            name?: string | null;
            path?: string | null;
            relativePath?: string | null;
        };
        UpdateChanges: {
            fixed?: string[] | null;
            new?: string[] | null;
        };
        /** @enum {string} */
        UpdateMechanism: "builtIn" | "script" | "external" | "apt" | "docker";
        UpdateResource: {
            branch?: string | null;
            changes?: components["schemas"]["UpdateChanges"];
            fileName?: string | null;
            hash?: string | null;
            /** Format: int32 */
            id?: number;
            installable?: boolean;
            installed?: boolean;
            /** Format: date-time */
            installedOn?: string | null;
            latest?: boolean;
            /** Format: date-time */
            releaseDate?: string;
            url?: string | null;
            version?: string | null;
        };
        ValidationFailure: {
            attemptedValue?: unknown;
            customState?: unknown;
            errorCode?: string | null;
            errorMessage?: string | null;
            /** @deprecated */
            formattedMessageArguments?: unknown[] | null;
            formattedMessagePlaceholderValues?: {
                [key: string]: unknown;
            } | null;
            propertyName?: string | null;
            severity?: components["schemas"]["Severity"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
