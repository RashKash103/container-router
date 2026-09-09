const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
    mode: 'production',
    entry: {
        settings: './src/settings/settings.js',
    },
    output: {
        filename: '[name]/[name].bundle.js',
        path: path.resolve(__dirname, 'build/webpack'),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            filename: 'settings/settings.html',
            template: 'src/settings/settings.html',
        }),
        new VueLoaderPlugin(),
        new CopyPlugin({
            patterns: [
                { 
                    from: 'src/background', 
                    to: 'background',
                    info : {
                        minimized: true
                    }
                },
                { 
                    from: 'src/extension',
                    info : {
                        minimized: true
                    }
                }
            ],

        })
    ],
    // Vue feature-detects `global`, which makes webpack emit a runtime helper
    // that falls back to `new Function('return this')`. The extension only ever
    // runs in a browser, where `globalThis` exists, and AMO flags the generated
    // Function constructor as an eval. Leaving `global` unshimmed keeps Vue's
    // `typeof global` check working while dropping the helper.
    node: {
        global: false,
    },
    watchOptions: {
        ignored: /node_modules/,
    },
}
