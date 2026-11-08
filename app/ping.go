package app

// PingService is the M0 round-trip check (Spike S4) between frontend and Go.
type PingService struct{}

func (PingService) Ping() string { return "pong" }
