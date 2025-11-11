export function createCrossmintProvider(_cfg) {
    return {
        async getOrCreateWallet() {
            throw new Error('Not implemented');
        },
        async balances(_address) {
            throw new Error('Not implemented');
        },
        async signMessage(_message) {
            throw new Error('Not implemented');
        },
        async signTransaction(_txBase64) {
            throw new Error('Not implemented');
        },
        async sendSOL(_to, _lamports, _fromAddress) {
            throw new Error('Not implemented');
        },
        async sendSPL(_to, _mint, _amount, _decimals, _fromAddress) {
            throw new Error('Not implemented');
        },
    };
}
